import React, { useState } from 'react';
import { MapPin, Navigation2, X } from 'lucide-react';
import { useLocation } from '../../context/LocationContext';

const LocationPermissionModal = ({ onComplete }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { refreshLocation } = useLocation();

  const handleEnableLocation = async () => {
    setIsLoading(true);
    try {
      await refreshLocation();
    } finally {
      setIsLoading(false);
      if (onComplete) onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="p-8 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
             <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" style={{ animationDuration: '3s' }}></div>
             <Navigation2 className="w-10 h-10 text-primary animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">
            Location Required
          </h2>
          <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed px-4">
            Please enable location access to see accurate pricing, delivery times, and availability in your area.
          </p>
          
          <button
            onClick={handleEnableLocation}
            disabled={isLoading}
            className="w-full bg-primary text-white font-black py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <MapPin size={20} />
                Enable Location
              </>
            )}
          </button>
          
          <button
            onClick={onComplete}
            disabled={isLoading}
            className="mt-4 text-slate-400 font-bold text-xs uppercase tracking-wider hover:text-slate-600 transition-colors"
          >
            Enter Manually Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationPermissionModal;
