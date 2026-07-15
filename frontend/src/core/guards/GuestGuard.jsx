import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import LottieLoader from '@/shared/components/ui/LottieLoader';

const GuestGuard = ({ children }) => {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return <LottieLoader fullScreen />;
    }

    if (isAuthenticated) {
        if (location.pathname.startsWith('/admin')) {
            return <Navigate to="/admin" replace />;
        }
        if (location.pathname.startsWith('/seller')) {
            return <Navigate to="/seller" replace />;
        }
        if (location.pathname.startsWith('/delivery')) {
            return <Navigate to="/delivery" replace />;
        }
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

export default GuestGuard;
