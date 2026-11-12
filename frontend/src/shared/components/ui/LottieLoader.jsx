import React from 'react';

const LottieLoader = ({ fullScreen = false, className = '' }) => {
    const loader = (
        <div className={`flex h-20 w-20 items-center justify-center ${className}`} role="status" aria-label="Loading">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
                {loader}
            </div>
        );
    }

    return loader;
};

export default LottieLoader;
