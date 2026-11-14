import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
    const clearProductTimerRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const previousPathRef = useRef(location.pathname);

    const openProduct = useCallback((product) => {
        const id = product?.id || product?._id;
        if (!id) return;

        if (clearProductTimerRef.current) {
            clearTimeout(clearProductTimerRef.current);
            clearProductTimerRef.current = null;
        }
        setSelectedProduct(product);
        setIsOpen(true);

        const productPath = `/product/${id}`;
        if (location.pathname !== productPath) {
            const alreadyOnProductRoute = location.pathname.startsWith('/product/');
            const returnTo = alreadyOnProductRoute
                ? location.state?.returnTo
                : `${location.pathname}${location.search}${location.hash}`;

            navigate(productPath, {
                replace: alreadyOnProductRoute,
                state: {
                    productModal: true,
                    returnTo: returnTo || '/',
                },
            });
        }
    }, [location, navigate]);

    const closeProduct = useCallback((skipHistory = false) => {
        // React passes the click event when this callback is used directly as
        // an onClick handler. Only a literal `true` means "do not navigate".
        const shouldSkipHistory = skipHistory === true;
        setIsOpen(false);

        if (!shouldSkipHistory && location.pathname.startsWith('/product/')) {
            if (location.state?.productModal) {
                navigate(-1);
            } else {
                navigate('/categories', { replace: true });
            }
        }

        clearProductTimerRef.current = setTimeout(() => {
            setSelectedProduct(null);
            clearProductTimerRef.current = null;
        }, 300);
    }, [location.pathname, location.state, navigate]);

    // Browser back/forward navigation is owned by React Router. If it moves
    // away from the modal URL, synchronize the sheet without writing another
    // history entry.
    useEffect(() => {
        const previousPath = previousPathRef.current;
        previousPathRef.current = location.pathname;
        if (
            !isOpen ||
            !previousPath.startsWith('/product/') ||
            location.pathname.startsWith('/product/')
        ) return;

        const routeSyncTimer = setTimeout(() => {
            setIsOpen(false);
            clearProductTimerRef.current = setTimeout(() => {
                setSelectedProduct(null);
                clearProductTimerRef.current = null;
            }, 300);
        }, 0);

        return () => clearTimeout(routeSyncTimer);
    }, [isOpen, location.pathname]);

    useEffect(() => () => {
        if (clearProductTimerRef.current) clearTimeout(clearProductTimerRef.current);
    }, []);

    const value = useMemo(
        () => ({ selectedProduct, isOpen, openProduct, closeProduct }),
        [selectedProduct, isOpen, openProduct, closeProduct]
    );

    return (
        <ProductDetailContext.Provider value={value}>
            {children}
        </ProductDetailContext.Provider>
    );
};
