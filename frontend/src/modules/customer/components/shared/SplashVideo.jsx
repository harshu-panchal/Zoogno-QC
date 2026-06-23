import React, { useEffect } from 'react';

const SplashVideo = ({ onComplete }) => {
    useEffect(() => {
        // Skip splash screen on desktop (web) view
        if (window.innerWidth > 768) {
            onComplete();
        }
    }, [onComplete]);

    // Don't render video on desktop view
    if (window.innerWidth > 768) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden md:hidden">
            <video 
                className="w-full h-full object-cover max-w-full max-h-full"
                autoPlay 
                muted 
                playsInline 
                onEnded={onComplete}
            >
                <source src="/WhatsApp Video 2026-06-18 at 2.43.12 PM-ezremove (1).mp4" type="video/mp4" />
            </video>
        </div>
    );
};

export default SplashVideo;
