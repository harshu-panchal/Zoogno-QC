import React, { useState, useEffect } from 'react';

const CountdownTimer = ({ endTime, onComplete }) => {
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
        if (!endTime) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const end = new Date(endTime).getTime();
            const distance = end - now;

            if (distance < 0) {
                clearInterval(interval);
                setTimeLeft('00:00:00');
                if (onComplete) onComplete();
                return;
            }

            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            setTimeLeft(
                `${hours.toString().padStart(2, '0')}:${minutes
                    .toString()
                    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        }, 1000);

        return () => clearInterval(interval);
    }, [endTime, onComplete]);

    if (!endTime) return null;

    return (
        <div className="font-mono text-xl font-bold tracking-widest text-brand-700 bg-brand-50 px-4 py-2 rounded-lg inline-block border border-brand-200 shadow-inner">
            {timeLeft}
        </div>
    );
};

export default CountdownTimer;
