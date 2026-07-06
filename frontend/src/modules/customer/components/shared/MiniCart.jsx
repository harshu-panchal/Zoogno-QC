import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useSettings } from '@core/context/SettingsContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import Lottie from 'lottie-react';
import scooterAnimation from '@/assets/scooter.json';

const MiniCart = () => {
    const { cart, cartCount } = useCart();
    const { settings } = useSettings();
    const location = useLocation();
    
    const [alternateText, setAlternateText] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setAlternateText(prev => !prev);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Show up to 2 product images
    const displayItems = cart.slice(0, 2);

    const path = location.pathname.replace(/\/$/, '') || '/';

    // Hide MiniCart on checkout page, order details page, profile page, wallet, transactions, wishlist, addresses, support, privacy, and about page
    const isCheckoutPage = path === '/checkout';
    const isOrderDetailsPage = path.startsWith('/orders');
    const isProfilePage = path === '/profile';
    const isWalletPage = path === '/wallet';
    const isTransactionsPage = path === '/transactions';
    const isAddressesPage = path.startsWith('/addresses');
    const isSupportPage = path.startsWith('/support');
    const isPrivacyPage = path.startsWith('/privacy');
    const isAboutPage = path.startsWith('/about');

    const isHidden = isCheckoutPage || isOrderDetailsPage || isProfilePage || isWalletPage || isTransactionsPage || isAddressesPage || isSupportPage || isPrivacyPage || isAboutPage || cart.length === 0;

    const rawThreshold = Number(settings?.freeDeliveryThreshold) || 0;
    const threshold = rawThreshold;
    const subtotal = cart.reduce((total, item) => {
        const itemPrice = Number(item.salePrice || item.price || 0);
        return total + (itemPrice * item.quantity);
    }, 0);
    
    // If threshold is 0, it means free delivery applies to all orders
    const isFreeDeliveryUnlocked = subtotal >= threshold;
    const amountNeeded = Math.max(threshold - subtotal, 0);
    const progressPercentage = threshold > 0 ? Math.min((subtotal / threshold) * 100, 100) : 100;

    return (
        <AnimatePresence>
            {!isHidden && (
                <div
                    key="mini-cart-wrapper"
                    id="mini-cart-target"
                    className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-[calc(6rem-20px)] left-0 right-0 flex justify-center z-[9998] pointer-events-none px-4"
                >

                    <motion.div
                        initial={{ y: 50, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 50, opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="w-full max-w-[400px] pointer-events-auto relative"
                    >
                        {/* Scooter Animation (Moved outside Link to avoid overflow hidden) */}
                        {(isFreeDeliveryUnlocked || alternateText) && (
                            <div className="absolute inset-x-0 -bottom-16 z-[100] pointer-events-none overflow-visible">
                                <div className="fast-scooter absolute bottom-0 h-40 w-40">
                                    <Lottie
                                        animationData={scooterAnimation}
                                        loop={true}
                                        className="w-full h-full object-contain drop-shadow-lg"
                                    />
                                </div>
                            </div>
                        )}
                        <Link
                            to="/checkout"
                            style={{
                                backgroundColor: "var(--customer-mini-cart-color, var(--primary))",
                            }}
                            className="flex flex-col text-white rounded-[20px] shadow-[0_10px_30px_rgba(0,0,0,0.22)] active:scale-[0.98] transition-transform group border border-white/10 relative overflow-hidden"
                        >
                            <div className="absolute inset-0 overflow-hidden rounded-[20px] pointer-events-none">
                                <div className="mini-cart-shimmer absolute inset-y-0 left-[-40%] w-[40%] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]" />
                            </div>

                            <div className="flex items-center justify-between p-3 h-14 relative">

                                {/* Left Section - Free Delivery Info */}
                                <div className="flex-1 flex flex-col justify-center min-w-0 pr-3 z-10 relative">
                                    {isFreeDeliveryUnlocked ? (
                                        <div className="flex items-center overflow-hidden">
                                            <h4 className="text-[14px] font-black leading-tight truncate tracking-wide text-white drop-shadow-md">
                                                You unlocked FREE DELIVERY
                                            </h4>
                                        </div>
                                    ) : (
                                        <>
                                            <AnimatePresence mode="wait">
                                                <motion.h4
                                                    key={alternateText ? 'alt' : 'main'}
                                                    initial={{ y: 10, opacity: 0 }}
                                                    animate={{ y: 0, opacity: 1 }}
                                                    exit={{ y: -10, opacity: 0 }}
                                                    transition={{ duration: 0.3 }}
                                                    className="text-[14px] font-black leading-tight tracking-wide text-white/90 drop-shadow-md"
                                                >
                                                    {alternateText ? (
                                                        <>Free Delivery above <span className="font-black text-white">₹{threshold}</span></>
                                                    ) : (
                                                        <>Add <span className="font-black text-white">₹{amountNeeded}</span> more to unlock FREE DELIVERY</>
                                                    )}
                                                </motion.h4>
                                            </AnimatePresence>
                                            {/* Progress Bar */}
                                            <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-green-300 to-emerald-400 rounded-full transition-all duration-500 ease-out" 
                                                    style={{ width: `${progressPercentage}%` }} 
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Right Section - Cart Overview & Images */}
                                <div className="flex items-center gap-2 pl-2 border-l border-white/20 flex-shrink-0 z-10">
                                    <div className="flex flex-col items-end justify-center mr-1">
                                        <h4 className="text-[11px] font-black leading-tight tracking-wider uppercase text-white/90">CART</h4>
                                        <p className="text-[9px] font-bold leading-tight text-white/70 uppercase tracking-widest">{cartCount} {cartCount === 1 ? 'ITEM' : 'ITEMS'}</p>
                                    </div>

                                    {!isFreeDeliveryUnlocked && (
                                        <div className="flex items-center -space-x-1.5 relative z-10">
                                            {displayItems.map((item, index) => (
                                                <div key={index} className="h-7 w-7 rounded-md bg-white flex items-center justify-center flex-shrink-0 shadow-sm border border-black/10 overflow-hidden relative z-[1]">
                                                    <img
                                                        src={applyCloudinaryTransform(item.image)}
                                                        alt={item.name}
                                                        loading="lazy"
                                                        className="w-full h-full object-contain p-0.5"
                                                    />
                                                </div>
                                            ))}
                                            {cart.length > 2 && (
                                                <div className="h-7 w-7 rounded-md bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 shadow-sm border border-white/30 text-[10px] font-black z-[0]">
                                                    +{cart.length - 2}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Arrow Icon */}
                                    <div className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ml-1">
                                        <ChevronRight size={18} strokeWidth={3} className="text-white/80 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                </div>
            )}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes mini-cart-shimmer {
                    0% { transform: translateX(-140%); }
                    100% { transform: translateX(320%); }
                }
                .mini-cart-shimmer {
                    animation: mini-cart-shimmer 2.8s ease-in-out infinite;
                }
                @keyframes fast-scooter-move {
                    0% { transform: translateX(-100px); opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { transform: translateX(350px); opacity: 0; }
                }
                .fast-scooter {
                    animation: fast-scooter-move 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
            `}} />
        </AnimatePresence>
    );
};

export default MiniCart;
