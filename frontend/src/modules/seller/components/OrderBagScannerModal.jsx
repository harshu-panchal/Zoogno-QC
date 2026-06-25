import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineXMark, HiOutlineQrCode } from 'react-icons/hi2';
import QRScanner from '@shared/components/ui/QRScanner';
import { useToast } from '@shared/components/ui/Toast';
import { validateScannedBagId } from '@shared/utils/qrBagUtils';

const OrderBagScannerModal = ({ isOpen, onClose, onScanSuccess }) => {
    const { showToast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);

    const handleScan = (data) => {
        if (!data || isProcessing) return;
        
        setIsProcessing(true);
        const validation = validateScannedBagId(data);
        
        if (!validation.valid || !validation.bagId) {
            showToast('Invalid QR Code format. Not a recognized Bag ID.', 'error');
            setTimeout(() => setIsProcessing(false), 2000);
            return;
        }

        onScanSuccess(validation.bagId);
        // We do not set isProcessing back to false immediately to prevent double scans, 
        // the parent will close the modal on success.
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[310] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-900/80 backdrop-blur-md"
                onClick={onClose}
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-sm relative z-10 bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
            >
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
                            <HiOutlineQrCode className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900">Scan QR Bag</h3>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hold camera steady</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                        <HiOutlineXMark className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 bg-slate-900">
                    <div className="aspect-square w-full max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-inner relative ring-4 ring-white/10">
                        <QRScanner 
                            onScanSuccess={handleScan}
                            stopDecoding={isProcessing}
                        />
                        {isProcessing && (
                            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-20 backdrop-blur-sm">
                                <div className="text-center">
                                    <div className="h-10 w-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                                    <p className="text-xs font-bold text-white uppercase tracking-widest">Processing...</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="px-5 py-4 bg-slate-50 text-center">
                    <p className="text-xs font-semibold text-slate-600">
                        Position the QR code inside the frame. It will scan automatically.
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default OrderBagScannerModal;
