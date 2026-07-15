import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';

const ProductDetailContext = createContext();

export const useProductDetail = () => {
    const context = useContext(ProductDetailContext);
    if (!context) {
        return {};
    }
    return context;
};

export const ProductDetailProvider = ({ children }) => {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [originalUrl, setOriginalUrl] = useState(null);

    const openProduct = (product) => {
        const id = product.id || product._id;
        if (id && !window.location.pathname.includes(`/product/${id}`)) {
            setOriginalUrl(window.location.pathname + window.location.search);
            window.history.pushState({ productModal: true }, '', `/product/${id}`);
        }
        setSelectedProduct(product);
        setIsOpen(true);
    };

    const closeProduct = () => {
        if (originalUrl) {
            if (window.location.pathname.startsWith('/product/')) {
                window.history.back();
            } else {
                window.history.replaceState({}, '', originalUrl);
            }
            setOriginalUrl(null);
        }
        setIsOpen(false);
        // Delay clearing product to allow close animation to finish
        setTimeout(() => setSelectedProduct(null), 300);
    };

    // Handle browser back button to close modal instead of navigating away
    useEffect(() => {
        const handlePopState = (event) => {
            if (isOpen) {
                // If they hit back button while modal is open, just close it
                setIsOpen(false);
                setTimeout(() => setSelectedProduct(null), 300);
                setOriginalUrl(null);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isOpen]);

    const value = useMemo(
        () => ({ selectedProduct, isOpen, openProduct, closeProduct }),
        [selectedProduct, isOpen]
    );

    return (
        <ProductDetailContext.Provider value={value}>
            {children}
        </ProductDetailContext.Provider>
    );
};
