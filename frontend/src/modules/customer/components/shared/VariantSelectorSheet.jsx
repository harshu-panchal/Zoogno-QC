import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ChevronRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';
import { cn } from '@/lib/utils';
import { useCartAnimation } from '../../context/CartAnimationContext';
import { useProductDetail } from '../../context/ProductDetailContext';

const VariantSelectorSheet = ({ product, isOpen, onClose, defaultVariantSku = null }) => {
    const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
    const { animateAddToCart, animateRemoveFromCart } = useCartAnimation();
    const { openProduct } = useProductDetail();
    
    // We'll manage the locally selected variant for the "ADD" button logic
    const [selectedVariantSku, setSelectedVariantSku] = useState(defaultVariantSku);

    // Update default selection when sheet opens or defaultVariantSku changes
    useEffect(() => {
        if (isOpen && product?.variants?.length > 0) {
            if (defaultVariantSku && product.variants.find(v => (v.sku || v.name) === defaultVariantSku)) {
                setSelectedVariantSku(defaultVariantSku);
            } else if (!selectedVariantSku || !product.variants.find(v => (v.sku || v.name) === selectedVariantSku)) {
                 setSelectedVariantSku(product.variants[0].sku || product.variants[0].name);
            }
        }
    }, [isOpen, product, defaultVariantSku]);

    if (!product || !isOpen) return null;

    const variants = product.variants || [];
    if (variants.length === 0) return null;

    const getCartItemForVariant = (variant) => {
        const vKey = String(variant.sku || variant.name || "").trim();
        const pId = product.id || product._id;
        const cartKey = `${pId}::${vKey}`;
        return cart.find((item) => `${item.id || item._id}::${String(item.variantSku || "").trim()}` === cartKey);
    };

    const handleIncrement = (variant) => {
        const vKey = String(variant.sku || variant.name || "").trim();
        const pId = product.id || product._id;
        updateQuantity(pId, 1, vKey);
    };

    const handleDecrement = (variant) => {
        const cartItem = getCartItemForVariant(variant);
        if (!cartItem) return;
        
        const vKey = String(variant.sku || variant.name || "").trim();
        const pId = product.id || product._id;

        if (cartItem.quantity === 1) {
            animateRemoveFromCart(product.mainImage || product.image);
            removeFromCart(pId, vKey);
        } else {
            updateQuantity(pId, -1, vKey);
        }
    };

    const handleAddToCart = (e, variant) => {
        e.preventDefault();
        e.stopPropagation();
        
        const vKey = String(variant.sku || variant.name || "").trim();
        const pId = product.id || product._id;
        
        // Add animation
        const rect = e.currentTarget.getBoundingClientRect();
        animateAddToCart(rect, product.mainImage || product.image);
        
        addToCart({
            ...product,
            variantSku: vKey,
            variantName: String(variant.name || "").trim(),
            price: variant.price,
            salePrice: variant.salePrice,
            // Override price in cart if needed, but cart context usually handles it.
        });
    };

    const handleProductClick = () => {
        if (openProduct) {
            onClose();
            openProduct(product);
        }
    };

    const selectedVariant = variants.find(v => (v.sku || v.name) === selectedVariantSku) || variants[0];
    const selectedCartItem = getCartItemForVariant(selectedVariant);

    const sheetContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-[9998] backdrop-blur-[2px]"
                    />

                    {/* Sheet */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white rounded-t-3xl z-[9999] flex flex-col shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 px-5 border-b border-gray-100">
                            <h3 className="font-bold text-lg text-slate-800">Select variant</h3>
                            <button
                                onClick={onClose}
                                className="p-2 -mr-2 bg-slate-50 text-slate-500 rounded-full hover:bg-slate-100 active:scale-95 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Variants List (Scrollable) */}
                        <div className="flex-1 overflow-y-auto px-5 py-5 pb-44">
                            <p className="text-sm text-slate-500 mb-4 font-medium">Quantity: {selectedVariant?.name}</p>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {variants.map((variant) => {
                                    const isSelected = (variant.sku || variant.name) === selectedVariantSku;
                                    const mrp = Number(variant.price || 0);
                                    const sale = Number(variant.salePrice || 0);
                                    const effective = sale > 0 && sale < mrp ? sale : mrp;
                                    const discountPercent = mrp > effective ? Math.round(((mrp - effective) / mrp) * 100) : 0;
                                    const cItem = getCartItemForVariant(variant);

                                    return (
                                        <div
                                            key={variant.sku || variant.name}
                                            onClick={() => setSelectedVariantSku(variant.sku || variant.name)}
                                            className={cn(
                                                "relative p-3 rounded-2xl border-[2px] transition-all cursor-pointer flex flex-col justify-between min-h-[120px]",
                                                isSelected
                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                    : "border-gray-100 bg-white hover:border-gray-200"
                                            )}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <span className="font-bold text-slate-800 text-sm">{variant.name}</span>
                                                {discountPercent > 0 ? (
                                                    <span className="text-[11px] font-[900] text-emerald-600 uppercase tracking-wide">
                                                        {discountPercent}% OFF
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] font-bold text-transparent select-none">No</span> // Placeholder for alignment
                                                )}
                                                
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="font-bold text-slate-900">₹{effective}</span>
                                                    {discountPercent > 0 && (
                                                        <span className="text-xs font-medium text-slate-400 line-through">₹{mrp}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Quantity Controls inside card if it's already in cart */}
                                            {cItem && cItem.quantity > 0 ? (
                                                <div className="mt-3 flex items-center bg-white border-[1.5px] border-primary rounded-lg p-0.5 justify-between w-full">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDecrement(variant); }}
                                                        className="p-1 px-1.5 text-primary active:scale-90 transition-transform"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <span className="font-bold text-primary text-sm">
                                                        {cItem.quantity}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleIncrement(variant); }}
                                                        className="p-1 px-1.5 text-primary active:scale-90 transition-transform"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sticky Footer */}
                        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 px-5 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                            {/* Top Section: Clickable Product Info */}
                            <div 
                                className="flex items-center gap-2.5 pb-2.5 border-b border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
                                onClick={handleProductClick}
                            >
                                <div className="w-8 h-8 rounded-md bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                                    <img 
                                        src={applyCloudinaryTransform(product.mainImage || product.image || "https://via.placeholder.com/150")} 
                                        alt={product.name} 
                                        className="w-full h-full object-cover mix-blend-multiply"
                                    />
                                </div>
                                <div className="flex flex-col flex-1 mr-2">
                                    <span className="text-[13px] font-bold text-slate-800 line-clamp-1">{product.name}</span>
                                </div>
                                <ChevronRight size={16} className="text-primary flex-shrink-0" />
                            </div>

                            {/* Bottom Section: Price & Add Button */}
                            {(() => {
                                const mrp = Number(selectedVariant?.price || 0);
                                const sale = Number(selectedVariant?.salePrice || 0);
                                const effective = sale > 0 && sale < mrp ? sale : mrp;
                                const discountPercent = mrp > effective ? Math.round(((mrp - effective) / mrp) * 100) : 0;
                                
                                return (
                                    <div className="flex items-end justify-between pt-3">
                                        <div className="flex flex-col">
                                            {discountPercent > 0 ? (
                                                <span className="text-[12px] font-[900] text-emerald-600 uppercase tracking-wide mb-0.5">
                                                    {discountPercent}% OFF
                                                </span>
                                            ) : null}
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="font-bold text-slate-900 text-lg">₹{effective}</span>
                                                {discountPercent > 0 && (
                                                    <span className="text-sm font-medium text-slate-400 line-through">₹{mrp}</span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-slate-500 font-medium">₹{effective}/{selectedVariant?.name || 'unit'}</span>
                                        </div>
                                        
                                        <div className="flex-shrink-0 min-w-[120px]">
                                            {!selectedCartItem || selectedCartItem.quantity === 0 ? (
                                                <button
                                                    onClick={(e) => handleAddToCart(e, selectedVariant)}
                                                    className="w-full bg-[#0052FF] hover:bg-blue-700 active:scale-[0.98] text-white py-2.5 px-4 rounded-xl font-bold transition-all shadow-md shadow-blue-500/20 text-sm flex items-center justify-center gap-1.5"
                                                >
                                                    <span className="text-lg leading-none mb-0.5">+</span> ADD
                                                </button>
                                            ) : (
                                                <div className="flex items-center bg-[#0052FF] text-white rounded-xl p-0.5 justify-between w-full shadow-md shadow-blue-500/20">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDecrement(selectedVariant); }}
                                                        className="p-2 px-3 active:scale-90 transition-transform"
                                                    >
                                                        <Minus size={18} strokeWidth={3} />
                                                    </button>
                                                    <span className="font-bold text-sm">
                                                        {selectedCartItem.quantity}
                                                    </span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleIncrement(selectedVariant); }}
                                                        className="p-2 px-3 active:scale-90 transition-transform"
                                                    >
                                                        <Plus size={18} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    // Render using a portal so it breaks out of parent's transform/overflow-hidden
    return createPortal(
        sheetContent,
        document.body
    );
};

export default VariantSelectorSheet;
