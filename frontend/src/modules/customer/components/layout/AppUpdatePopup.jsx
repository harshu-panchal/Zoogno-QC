import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Sparkles, X } from 'lucide-react';
import { useAuth } from '@core/context/AuthContext';
import { customerApi } from '../../services/customerApi';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.zoogno.app';
const UPDATE_CAMPAIGN = 'playstore-v1';

const AppUpdatePopup = () => {
    const { user } = useAuth();
    const [dismissedForKey, setDismissedForKey] = useState(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    const customerId = user?._id || user?.id || null;
    const storageKey = useMemo(
        () => customerId ? `zoogno:customer-app-update:${UPDATE_CAMPAIGN}:${customerId}` : null,
        [customerId],
    );

    const hasRedirected = useMemo(() => {
        if (user?.appUpdatePromptVersion === UPDATE_CAMPAIGN) return true;
        if (!storageKey) return false;
        try {
            return window.localStorage.getItem(storageKey) === 'redirected';
        } catch {
            return false;
        }
    }, [storageKey, user?.appUpdatePromptVersion]);

    const isOpen = Boolean(storageKey && !hasRedirected && dismissedForKey !== storageKey);

    const handleUpdate = async () => {
        if (isRedirecting) return;
        setIsRedirecting(true);

        if (storageKey) {
            try {
                window.localStorage.setItem(storageKey, 'redirected');
            } catch {
                // The redirect should still work when storage is unavailable.
            }
        }

        setDismissedForKey(storageKey);
        try {
            await customerApi.acknowledgeAppUpdatePrompt();
        } catch {
            // Local storage still prevents repeated prompts on this device.
        } finally {
            window.location.assign(PLAY_STORE_URL);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-5 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="app-update-title"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 28, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-white p-6 text-center shadow-2xl"
                    >
                        <button
                            type="button"
                            onClick={() => setDismissedForKey(storageKey)}
                            className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
                            aria-label="Close update popup"
                        >
                            <X size={18} />
                        </button>

                        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25">
                            <Download size={38} strokeWidth={2.4} />
                        </div>

                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                            <Sparkles size={13} />
                            New update available
                        </div>

                        <h2 id="app-update-title" className="mt-3 text-2xl font-black text-slate-900">
                            Update Zoogno
                        </h2>
                        <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                            Get the latest features, improvements, and the best shopping experience from the Play Store.
                        </p>

                        <button
                            type="button"
                            onClick={handleUpdate}
                            disabled={isRedirecting}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-brand-600/25 transition-all hover:bg-brand-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                        >
                            <Download size={18} />
                            {isRedirecting ? 'Opening Play Store...' : 'Update App'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setDismissedForKey(storageKey)}
                            className="mt-3 w-full py-2 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
                        >
                            Maybe later
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AppUpdatePopup;
