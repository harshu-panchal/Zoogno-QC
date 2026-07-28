import React, { useState, useEffect } from 'react';
import { X, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AppDownloadPopup = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only for desktop
    const isDesktop = window.innerWidth >= 1024;
    if (!isDesktop) return;

    // Function to show the popup and auto-hide it after 3 seconds
    const triggerPopup = () => {
      setIsOpen(true);
      
      // Auto close after 3 seconds
      setTimeout(() => {
        setIsOpen((prev) => {
           // We use an updater function to ensure we don't depend on stale state,
           // though in this simple case it just sets it to false.
           return false;
        });
      }, 3000);
    };

    // Initial trigger after 1.5s delay
    const initialTimer = setTimeout(() => {
      triggerPopup();
    }, 1500);

    // Repeat every 5 minutes (300000 ms)
    const intervalTimer = setInterval(() => {
      triggerPopup();
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none drop-shadow-2xl">
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className="bg-white rounded-[24px] p-5 max-w-[340px] w-full shadow-2xl relative pointer-events-auto border border-slate-100"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Content */}
            <div className="flex items-start gap-4 mt-1">
              {/* Icon / Image */}
              <div className="w-20 h-20 shrink-0">
                <img src="/download.png" alt="App Download" className="w-full h-full object-contain drop-shadow-md" />
              </div>

              {/* Text & Button */}
              <div className="text-left">
                <h2 className="text-sm font-black text-slate-900 mb-1 uppercase tracking-wide">
                  Get the Zoogno App!
                </h2>
                <p className="text-slate-500 font-medium text-xs mb-3 leading-relaxed">
                  For the best experience & offers, download our mobile app.
                </p>

                {/* Download Button */}
                <a
                  href="https://play.google.com/store/apps/details?id=com.zoogno.app&pcampaignid=web_share"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex py-2 px-4 rounded-[12px] bg-primary text-white font-bold hover:bg-primary/90 shadow-md shadow-primary/20 transition-all active:scale-95 text-xs items-center justify-center"
                >
                  Download App
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AppDownloadPopup;
