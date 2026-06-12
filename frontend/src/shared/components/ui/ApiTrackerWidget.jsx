import React, { useState, useEffect } from 'react';
import { globalApiCount, subscribeToApiCount } from '@core/api/axios';
import { Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ApiTrackerWidget = () => {
    const [count, setCount] = useState(globalApiCount);

    useEffect(() => {
        const unsubscribe = subscribeToApiCount(setCount);
        return () => unsubscribe();
    }, []);

    return (
        <AnimatePresence>
            {count > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-4 left-4 z-[9999] bg-slate-900/90 backdrop-blur text-white px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-2 shadow-lg hover:scale-105 transition-transform cursor-default border border-slate-700/50"
                >
                    <Activity size={14} className="text-brand-400" />
                    <span>API Calls: <span className="text-brand-300">{count}</span></span>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ApiTrackerWidget;
