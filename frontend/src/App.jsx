import { Suspense, useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import AppRouter from '@core/routes/AppRouter';
import { AuthProvider } from '@core/context/AuthContext';
import { SettingsProvider } from '@core/context/SettingsContext';
import { SupportUnreadProvider } from '@core/context/SupportUnreadContext';
import SeoHead from '@core/components/SeoHead';
import { ToastProvider } from './shared/components/ui/Toast';
import Loader from './shared/components/ui/Loader';
import ErrorBoundary from './shared/components/ErrorBoundary';
import LenisScroll from './shared/components/LenisScroll';
import SplashVideo from './modules/customer/components/shared/SplashVideo';

function App() {
    const [showSplash, setShowSplash] = useState(true);

    return (
        <HelmetProvider>
            <ErrorBoundary>
                <AuthProvider>
                    <SettingsProvider>
                        <SeoHead />
                        <ToastProvider>
                            <Suspense fallback={<Loader fullScreen />}>
                                <SupportUnreadProvider>
                                    <LenisScroll />
                                    {showSplash && <SplashVideo onComplete={() => setShowSplash(false)} />}
                                    <AppRouter />
                                </SupportUnreadProvider>
                            </Suspense>
                        </ToastProvider>
                    </SettingsProvider>
                </AuthProvider>
            </ErrorBoundary>
        </HelmetProvider>
    );
}

export default App;
