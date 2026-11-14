import { useEffect, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import Home from './Home';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import { useLocation as useAppLocation } from '../context/LocationContext';

import { useToast } from '../../../shared/components/ui/Toast';

const ProductDetailPage = () => {
    const { id } = useParams();
    const { openProduct, isOpen } = useProductDetail();
    const { currentLocation, isLocationReady } = useAppLocation();
    const navigate = useNavigate();
    const routeLocation = useLocation();
    const { showToast } = useToast();
    const requestedProductIdRef = useRef(null);

    useEffect(() => {
        // Card clicks already put the selected product in context. This page
        // only fetches when someone lands directly on a product URL. Without
        // this distinction, closing a card-opened modal briefly makes
        // `isOpen` false while this route is still mounted, which fetched and
        // reopened the same product.
        if (
            !isLocationReady ||
            !id ||
            isOpen ||
            routeLocation.state?.productModal ||
            requestedProductIdRef.current === id
        ) return;

        requestedProductIdRef.current = id;
        let cancelled = false;

        const loadProduct = async () => {
            try {
                const params = {};
                if (currentLocation && Number.isFinite(currentLocation.latitude) && Number.isFinite(currentLocation.longitude) && (currentLocation.latitude !== 0 || currentLocation.longitude !== 0)) {
                    params.lat = currentLocation.latitude;
                    params.lng = currentLocation.longitude;
                }
                const res = await customerApi.getProductById(id, params);
                if (cancelled) return;
                if (res.data.success) {
                    const p = res.data.result;
                    const formatted = {
                        ...p,
                        id: p._id,
                        images: [p.mainImage, ...(p.galleryImages || [])].filter(Boolean)
                    };
                    openProduct(formatted);
                } else {
                    showToast('Product not found or not available in your area', 'error');
                    navigate('/', { replace: true });
                }
            } catch (err) {
                if (cancelled) return;
                console.error("Failed to load product:", err);
                showToast('Product not found or not available in your area', 'error');
                navigate('/', { replace: true });
            }
        };

        loadProduct();

        return () => {
            cancelled = true;
            if (requestedProductIdRef.current === id) {
                requestedProductIdRef.current = null;
            }
        };
    }, [id, isOpen, navigate, openProduct, currentLocation, isLocationReady, routeLocation.state, showToast]);

    // Render Home page in the background so it looks exactly like clicking a product from the home page.
    return <Home />;
};

export default ProductDetailPage;
