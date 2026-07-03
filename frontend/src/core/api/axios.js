import axios from 'axios';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';
import { getStoredAuthToken } from '@core/utils/authStorage';
import { getActiveRole, ROLES } from '@core/auth/activeRoleStore';

const ROLE_STORAGE_KEYS = ['auth_seller', 'auth_admin', 'auth_delivery', 'auth_customer'];

const ROLE_TO_STORAGE_KEY = {
    [ROLES.SELLER]: 'auth_seller',
    [ROLES.ADMIN]: 'auth_admin',
    [ROLES.DELIVERY]: 'auth_delivery',
    [ROLES.CUSTOMER]: 'auth_customer',
};

// URL-prefix → storage-key map used as a *fallback* for the few call sites
// (e.g. an admin page that calls a /products endpoint) where the request URL
// itself encodes the intended role. The primary source is the activeRoleStore.
function tokenForRequestUrl(url) {
    if (!url) return null;
    if (url.startsWith('/seller')) return getStoredAuthToken('auth_seller');
    if (url.startsWith('/admin')) return getStoredAuthToken('auth_admin');
    if (url.startsWith('/delivery')) return getStoredAuthToken('auth_delivery');
    if (
        url.startsWith('/customer') ||
        url.startsWith('/cart') ||
        url.startsWith('/wishlist') ||
        url.startsWith('/categories') ||
        url.startsWith('/products') ||
        url.startsWith('/payments')
    ) {
        return getStoredAuthToken('auth_customer');
    }
    return null;
}

export let globalApiCount = 0;
const apiCountListeners = new Set();

export const subscribeToApiCount = (listener) => {
    apiCountListeners.add(listener);
    return () => apiCountListeners.delete(listener);
};

const axiosInstance = axios.create({
    baseURL: resolveApiBaseUrl(),
});

axiosInstance.interceptors.request.use(
    (config) => {
        globalApiCount++;
        apiCountListeners.forEach((l) => l(globalApiCount));
        
        const url = config.url || '';
        const isMultipartRequest =
            typeof FormData !== 'undefined' && config.data instanceof FormData;

        if (isMultipartRequest) {
            if (typeof config.headers?.delete === 'function') {
                config.headers.delete('Content-Type');
            } else if (config.headers) {
                delete config.headers['Content-Type'];
            }
        }

        // Primary: pick token from the active role (set by the router on mount).
        const activeRole = getActiveRole();
        const primaryStorageKey = ROLE_TO_STORAGE_KEY[activeRole];
        let token = primaryStorageKey ? getStoredAuthToken(primaryStorageKey) : null;

        // Fallback 1: URL-derived token (cross-portal calls, e.g. admin → /products).
        if (!token) {
            token = tokenForRequestUrl(url);
        }

        // Fallback 2: customer token for un-prefixed/public-ish endpoints while
        // the user is not currently inside a privileged portal.
        if (
            !token &&
            activeRole !== ROLES.ADMIN &&
            activeRole !== ROLES.SELLER &&
            activeRole !== ROLES.DELIVERY
        ) {
            token = getStoredAuthToken('auth_customer');
        }

        // Fallback 3: legacy shared 'token' key.
        if (!token) {
            token = getStoredAuthToken('token');
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return axiosInstance(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const activeRole = getActiveRole();
            if (activeRole === ROLES.DELIVERY || activeRole === ROLES.SELLER || activeRole === ROLES.ADMIN) {
                const { getStoredRefreshToken } = await import('@core/utils/authStorage');
                const primaryStorageKey = ROLE_TO_STORAGE_KEY[activeRole];
                const refreshToken = getStoredRefreshToken(primaryStorageKey);
                
                if (refreshToken) {
                    try {
                        const refreshResponse = await axios.post(
                            `${resolveApiBaseUrl()}/${activeRole}/refresh-token`,
                            { refreshToken }
                        );
                        if (refreshResponse.data && refreshResponse.data.result) {
                            const newAuthData = refreshResponse.data.result;
                            const storedData = {
                                accessToken: newAuthData.token,
                                refreshToken: newAuthData.refreshToken
                            };
                            localStorage.setItem(primaryStorageKey, JSON.stringify(storedData));
                            
                            window.dispatchEvent(new Event('storage')); // trigger sync in AuthContext
                            
                            originalRequest.headers.Authorization = `Bearer ${newAuthData.token}`;
                            
                            processQueue(null, newAuthData.token);
                            return axiosInstance(originalRequest);
                        }
                    } catch (refreshError) {
                        console.error(`Refresh token failed for ${activeRole}`, refreshError);
                        processQueue(refreshError, null);
                        localStorage.removeItem(primaryStorageKey);
                        window.dispatchEvent(new Event('storage'));
                        window.location.href = `/${activeRole}/auth`;
                        return Promise.reject(refreshError);
                    } finally {
                        isRefreshing = false;
                    }
                }
            }

            isRefreshing = false;
            const hasStoredRoleToken = ROLE_STORAGE_KEYS.some((key) => localStorage.getItem(key));
            if (hasStoredRoleToken) {
                console.warn(
                    '[axios] Received 401 response. Preserving stored auth tokens; session data is only cleared by explicit logout.',
                    {
                        url: originalRequest?.url,
                        method: originalRequest?.method,
                    }
                );
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
