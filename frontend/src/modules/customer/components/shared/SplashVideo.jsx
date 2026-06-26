import React, { useEffect, useRef, useState } from 'react';

const SplashVideo = ({ onComplete }) => {
    const videoRef = useRef(null);
    const [needsInteraction, setNeedsInteraction] = useState(false);

    useEffect(() => {
        if (videoRef.current) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    // Autoplay was prevented, usually because it's unmuted
                    setNeedsInteraction(true);
                });
            }
        }
    }, []);

    const handlePlayClick = () => {
        if (videoRef.current) {
            videoRef.current.play();
            setNeedsInteraction(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center overflow-hidden">
            <video 
                ref={videoRef}
                className="w-full h-full object-cover max-w-full max-h-full"
                playsInline 
                onEnded={onComplete}
                poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                // preload="auto"
            >
                <source src="/stating.mp4" type="video/mp4" />
            </video>

            {needsInteraction && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
                    <button 
                        onClick={handlePlayClick}
                        className="bg-white text-black px-8 py-4 rounded-full font-bold text-lg shadow-lg active:scale-95 transition-transform"
                    >
                        Tap to Start Experience
                    </button>
                </div>
            )}
        </div>
    );
};

export default SplashVideo;
