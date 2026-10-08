import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import axiosInstance from '@core/api/axios';
import { getWithDedupe } from '@core/api/dedupe';
import { getStoredAuthToken, getStoredRefreshToken } from '@core/utils/authStorage';
import { isTokenExpired } from '@core/utils/token';
import { resolveApiBaseUrl } from '@core/api/resolveApiBaseUrl';
import {
    getActiveRole,
    subscribeActiveRole,
} from '@core/auth/activeRoleStore';

const AuthContext = createContext(undefined);

const ROLE_STORAGE_KEYS = {
    customer: 'auth_customer',
    seller: 'auth_seller',
    admin: 'auth_admin',
    delivery: 'auth_delivery'
};

const LEGACY_TOKEN_KEY = 'token';

export const AuthProvider = ({ children }) => {
    const getSafeToken = (key) => getStoredAuthToken(ROLE_STORAGE_KEYS[key]);

    const [authData, setAuthData] = useState({
        customer: getSafeToken('customer'),
        seller: getSafeToken('seller'),
        admin: getSafeToken('admin'),
        delivery: getSafeToken('delivery'),
    });

    // Subscribe to the activeRoleStore so this context re-renders whenever the
    // router flips the active portal. The store also falls back to URL
    // inference on first read, so behavior matches the previous implementation
    // before any router has explicitly set a role.
    const [currentRole, setCurrentRole] = useState(getActiveRole());
    useEffect(() => {
        const unsub = subscribeActiveRole((next) => setCurrentRole(next));
        return unsub;
    }, []);

    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const token = authData[currentRole];
    const isAuthenticated = !!token;

    useEffect(() => {
        const syncStoredTokens = () => {
            setAuthData({
                customer: getSafeToken('customer'),
                seller: getSafeToken('seller'),
                admin: getSafeToken('admin'),
                delivery: getSafeToken('delivery'),
            });
        };

        window.addEventListener('focus', syncStoredTokens);
        window.addEventListener('storage', syncStoredTokens);
        document.addEventListener('visibilitychange', syncStoredTokens);

        return () => {
            window.removeEventListener('focus', syncStoredTokens);
            window.removeEventListener('storage', syncStoredTokens);
            document.removeEventListener('visibilitychange', syncStoredTokens);
        };
    }, []);

    // Proactive silent refresh: if the access token is expired but a valid
    // refresh token exists, fetch a new access token immediately so the user
    // never sees a 401 flash or gets kicked to the login screen.
    const isRefreshingRef = useRef(false);
    useEffect(() => {
        if (!token || !currentRole) return;
        if (!isTokenExpired(token)) return; // Token still valid, nothing to do

        const storageKey = ROLE_STORAGE_KEYS[currentRole];
        if (!storageKey) return;

        const refreshToken = getStoredRefreshToken(storageKey);
        if (!refreshToken || isTokenExpired(refreshToken)) return;

        if (isRefreshingRef.current) return;
        isRefreshingRef.current = true;

        let cancelled = false;

        const silentRefresh = async () => {
            try {
                const baseUrl = resolveApiBaseUrl();
                const response = await fetch(`${baseUrl}/${currentRole}/refresh-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                });
                const data = await response.json();
                if (cancelled || !data?.result?.token) return;

                const storedData = {
                    accessToken: data.result.token,
                    refreshToken: data.result.refreshToken || refreshToken,
                };
                localStorage.setItem(storageKey, JSON.stringify(storedData));
                setAuthData(prev => ({ ...prev, [currentRole]: data.result.token }));
            } catch (err) {
                console.warn('[auth] Silent token refresh failed:', err?.message || err);
            } finally {
                isRefreshingRef.current = false;
            }
        };

        silentRefresh();
        return () => { cancelled = true; };
    }, [token, currentRole]);

    // Register FCM token after login (non-blocking).
    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        let cleanupDeferredRegistration = null;
        let push = null;
        let registering = false;

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // Registers this device for the current role. Safe to call repeatedly: the server
        // upserts by token, which also re-activates a token it had deactivated.
        const registerDevice = async () => {
            if (!push || registering || cancelled) return;
            registering = true;
            try {
                // Seller/delivery run inside flutter_inappwebview, whose bridge is injected after
                // the page boots. Deciding "web or native" before it exists sends the app down the
                // browser path, which cannot work in a WebView, so the device never got a token.
                const native = await push.waitForNativeBridge();
                if (cancelled) return;

                if (native) {
                    // Native FCM layer may not be ready right at login - retry with backoff.
                    for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
                        try {
                            await push.ensureFcmTokenRegistered({ role: currentRole, platform: 'app' });
                            return;
                        } catch (error) {
                            console.warn('[push] Native registration attempt', attempt + 1, 'failed:', error?.message || error);
                            if (attempt === 4) throw error;
                            await sleep(2000 * (attempt + 1));
                        }
                    }
                    return;
                }

                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    // Transient failures (SW not ready yet, network) must not leave the device tokenless.
                    for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
                        try {
                            await push.ensureFcmTokenRegistered({ role: currentRole, platform: 'web' });
                            return;
                        } catch (error) {
                            if (attempt === 2) throw error;
                            await sleep(2000 * (attempt + 1));
                        }
                    }
                    return;
                }

                // Permission not yet granted: browsers need a user gesture to prompt.
                cleanupDeferredRegistration = push.scheduleFcmRegistrationOnUserGesture({
                    role: currentRole,
                    platform: 'web',
                    onError: (error) => {
                        console.warn('[push] Deferred registration failed:', error?.message || error);
                    },
                });
            } finally {
                registering = false;
            }
        };

        // Re-assert the registration when the app returns to the foreground. Without this a
        // token that FCM rotated or the server deactivated is never repaired while the app
        // process stays alive (the usual case for a rider/seller app left running all day).
        const onVisible = () => {
            if (document.visibilityState !== 'visible' || !push || cancelled) return;
            if (!push.isNativeApp() && push.hasRegisteredFcmToken(currentRole)) return;
            registerDevice().catch((error) => {
                console.warn('[push] Re-sync on resume failed:', error?.message || error);
            });
        };

        // Fire-and-forget; never block auth/profile load.
        setTimeout(() => {
            import('@core/firebase/pushClient')
                .then(async (mod) => {
                    if (cancelled) return;
                    push = mod;

                    // Register first. The foreground listener is optional, and a failure in it
                    // used to abort this whole chain before registration was ever attempted.
                    // Native apps always re-send: the server row can be deleted/invalidated while this
                    // WebView process (and its sessionStorage "registered" flag) stays alive.
                    const native = await push.waitForNativeBridge();
                    if (cancelled) return;
                    if (native || !push.hasRegisteredFcmToken(currentRole)) {
                        await registerDevice();
                    }
                })
                .catch((error) => {
                    // Permission denied / unsupported / any error: retried on resume or from push-enabled actions.
                    console.warn('[push] Auto-registration skipped:', error?.message || error);
                })
                .finally(() => {
                    if (cancelled || !push) return;
                    push.startForegroundPushListener().catch((error) => {
                        console.warn('[push] Foreground listener not started:', error?.message || error);
                    });
                });
        }, 0);

        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
            if (typeof cleanupDeferredRegistration === 'function') {
                cleanupDeferredRegistration();
            }
        };
    }, [token, currentRole]);

    // Fetch user profile on mount or token change
    useEffect(() => {
        const fetchProfile = async () => {
            if (token) {
                try {
                    setIsLoading(true);
                    // Use deduplicated fetch to avoid multiple simultaneous profile calls
                    const endpoint = `/${currentRole}/profile`;
                    const response = await getWithDedupe(endpoint, {}, { ttl: 5000 });
                    setUser(response.data.result);
                } catch (error) {
                    console.error('Failed to fetch profile:', error);
                    if (error.response && (error.response.status === 401 || error.response.status === 404)) {
                        const storageKey = ROLE_STORAGE_KEYS[currentRole];
                        if (storageKey) localStorage.removeItem(storageKey);
                        setAuthData(prev => ({ ...prev, [currentRole]: null }));
                    }
                    // Preserve stored tokens on request failures; only manual logout clears auth storage.
                    setUser(null);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setUser(null);
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [token, currentRole]);

    const login = (userData) => {
        const role = userData.role?.toLowerCase() || 'customer';
        const storageKey = ROLE_STORAGE_KEYS[role];

        if (storageKey && userData.token) {
            if (userData.refreshToken) {
                const storedData = {
                    accessToken: userData.token,
                    refreshToken: userData.refreshToken
                };
                localStorage.setItem(storageKey, JSON.stringify(storedData));
            } else {
                localStorage.setItem(storageKey, userData.token);
            }

            setAuthData(prev => ({ ...prev, [role]: userData.token }));
            setUser(userData); // Set full data initially
        } else {
            console.error('Invalid role or missing token for login:', role);
        }
    };

    const logout = async () => {
        const storageKey = ROLE_STORAGE_KEYS[currentRole];

        try {
            const { getStoredFcmToken, removeStoredFcmToken } = await import('@core/firebase/pushClient');
            const fcmToken = getStoredFcmToken(currentRole);
            
            // Call backend logout API to delete FCM token and invalidate session if needed
            if (token) {
                const apiBasePath = currentRole === 'customer' ? 'customer' : currentRole;
                await axiosInstance.post(`/${apiBasePath}/logout`, { fcmToken }).catch(() => {});
            }

            await removeStoredFcmToken({ role: currentRole });
        } catch (error) {
            console.warn('Failed to remove push token or call logout API:', error);
        }

        if (storageKey) {
            localStorage.removeItem(storageKey);
        }

        // Remove the legacy shared token only when it belongs to the current role session.
        if (token && localStorage.getItem(LEGACY_TOKEN_KEY) === token) {
            localStorage.removeItem(LEGACY_TOKEN_KEY);
        }

        sessionStorage.removeItem(`push:registered:${currentRole}`);
        localStorage.removeItem(`push:fcm-token:${currentRole}`);

        setAuthData((prev) => ({
            ...prev,
            [currentRole]: null,
        }));

        // Clear the current user profile from memory
        setUser(null);

        // Final fallback: redirect based on current path if needed
        // (ProtectedRoute usually handles this, but explicit navigation is safer for some UI edge cases)
        const path = window.location.pathname;
        if (path.startsWith('/admin')) window.location.href = '/admin/auth';
        else if (path.startsWith('/seller')) window.location.href = '/seller/auth';
        else if (path.startsWith('/delivery')) window.location.href = '/delivery/auth';
        else window.location.href = '/login';
    };

    const refreshUser = async () => {
        if (token) {
            try {
                const endpoint = `/${currentRole}/profile`;
                const response = await axiosInstance.get(endpoint);
                setUser(response.data.result);
                return response.data.result;
            } catch (error) {
                console.error('Failed to refresh profile:', error);
            }
        }
    };

    const value = useMemo(() => ({
        user,
        token,
        role: currentRole,
        isAuthenticated,
        isLoading,
        authData,
        login,
        logout,
        refreshUser
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [user, token, currentRole, isAuthenticated, isLoading, authData]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
