import React, { useState } from 'react';
import { Share2, X, Copy, Check, MessageCircle, Send, Facebook } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';

const ShareBridge = ({ isOpen, onClose, product }) => {
    const { showToast } = useToast();
    const [copied, setCopied] = useState(false);

    if (!product) return null;

    const shareUrl = `https://zoogno.com/share/product/${product.id}`; // Ensure it points to backend proxy for OG tags
    const shareMessage = `*${product.name}*\nPrice: ₹${product.salePrice || product.price}\n\nView and buy here:\n${shareUrl}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareMessage);
            setCopied(true);
            showToast("Details & Link copied!", "success");
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            showToast("Failed to copy", "error");
        }
    };

    const shareOptions = [
        {
            name: 'WhatsApp',
            icon: <MessageCircle className="text-white" size={24} />,
            color: 'bg-green-500 hover:bg-green-600',
            onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank')
        },
        {
            name: 'Telegram',
            icon: <Send className="text-white" size={24} />,
            color: 'bg-blue-500 hover:bg-blue-600',
            onClick: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out ${product.name} for ₹${product.salePrice || product.price}!`)}`, '_blank')
        },
        {
            name: 'Facebook',
            icon: <Facebook className="text-white" size={24} />,
            color: 'bg-blue-600 hover:bg-blue-700',
            onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank')
        }
    ];

    if (navigator.share) {
        shareOptions.push({
            name: 'More',
            icon: <Share2 className="text-slate-600" size={24} />,
            color: 'bg-slate-200 hover:bg-slate-300',
            onClick: async () => {
                try {
                    const shareData = {
                        title: product.name,
                        text: `Check out ${product.name} for ₹${product.salePrice || product.price}!\n\n`,
                        url: shareUrl
                    };

                    const imageUrl = product.mainImage || product.image || (product.galleryImages?.[0]);
                    if (imageUrl && navigator.canShare) {
                        try {
                            const response = await fetch(imageUrl);
                            const blob = await response.blob();
                            const file = new File([blob], 'product.jpg', { type: blob.type });
                            if (navigator.canShare({ files: [file] })) {
                                shareData.files = [file];
                            }
                        } catch (e) {
                            console.error("Could not fetch image for sharing", e);
                        }
                    }

                    await navigator.share(shareData);
                } catch (err) {
                    console.error("Native share failed:", err);
                }
            }
        });
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[300]"
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 100, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 100, scale: 0.95 }}
                        className="fixed bottom-0 left-0 right-0 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] p-6 z-[301] shadow-2xl border border-slate-100"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                                <Share2 className="text-primary" /> Share Product
                            </h3>
                            <button
                                onClick={onClose}
                                className="h-10 w-10 bg-slate-50 hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-400 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
                            <div className="h-16 w-16 bg-white rounded-xl border border-slate-100 p-2 overflow-hidden flex-shrink-0">
                                <img
                                    src={product.mainImage || product.image || (product.galleryImages?.[0]) || '/placeholder.png'}
                                    alt={product.name}
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-slate-800 truncate">{product.name}</h4>
                                <p className="text-sm font-black text-primary">₹{product.salePrice || product.price}</p>
                            </div>
                        </div>

                        <div className="flex justify-center gap-6 mb-6 flex-wrap">
                            {shareOptions.map((option) => (
                                <button
                                    key={option.name}
                                    onClick={option.onClick}
                                    className="flex flex-col items-center gap-2 group"
                                >
                                    <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-active:scale-95 shadow-lg", option.color)}>
                                        {option.icon}
                                    </div>
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{option.name}</span>
                                </button>
                            ))}
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Share2 size={16} className="text-slate-400" />
                            </div>
                            <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-10 pr-24 text-sm font-medium text-slate-500 outline-none truncate"
                            />
                            <button
                                onClick={handleCopy}
                                className="absolute inset-y-2 right-2 px-4 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all flex items-center gap-1 active:scale-95"
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ShareBridge;
