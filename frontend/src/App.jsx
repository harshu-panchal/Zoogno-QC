import { Suspense, useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import AppRouter from '@core/routes/AppRouter';
import { AuthProvider } from '@core/context/AuthContext';
import { SettingsProvider } from '@core/context/SettingsContext';
import { SupportUnreadProvider } from '@core/context/SupportUnreadContext';
import SeoHead from '@core/components/SeoHead';
import { ToastProvider } from './shared/components/ui/Toast';
import LottieLoader from './shared/components/ui/LottieLoader';
import ErrorBoundary from './shared/components/ErrorBoundary';
import LenisScroll from './shared/components/LenisScroll';

function App() {
    const isMobileView = window.innerWidth <= 768;
    const isCustomerModule = !window.location.pathname.startsWith('/seller') && !window.location.pathname.startsWith('/admin');
    const isPaymentCallback = window.location.pathname.includes('/payment-status') || window.location.search.includes('payment_callback');

    return (
        <HelmetProvider>
            <ErrorBoundary>
                <AuthProvider>
                    <SettingsProvider>
                        <SeoHead />
                        <ToastProvider>
                            <Suspense fallback={<LottieLoader fullScreen />}>
                                <SupportUnreadProvider>
                                    <LenisScroll />
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
