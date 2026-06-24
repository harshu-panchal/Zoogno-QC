import React from 'react';
import Lottie from 'lottie-react';
import loadingAnimation from '@/assets/loading.json';

const LottieLoader = ({ fullScreen = false, className = '' }) => {
    const loader = (
        <div className={`w-32 h-32 ${className}`}>
            <Lottie animationData={loadingAnimation} loop={true} />
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
