import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
    const { showToast } = useToast();

    useEffect(() => {
        if (!isLocationReady) return; // Wait for location to resolve first

        const loadProduct = async () => {
            try {
                const params = {};
                if (currentLocation && Number.isFinite(currentLocation.latitude) && Number.isFinite(currentLocation.longitude) && (currentLocation.latitude !== 0 || currentLocation.longitude !== 0)) {
                    params.lat = currentLocation.latitude;
                    params.lng = currentLocation.longitude;
                }
                const res = await customerApi.getProductById(id, params);
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
                console.error("Failed to load product:", err);
                showToast('Product not found or not available in your area', 'error');
                navigate('/', { replace: true });
            }
        };

        if (id && !isOpen) {
            loadProduct();
        }
    }, [id, isOpen, navigate, openProduct, currentLocation, isLocationReady, showToast]);

    // Render Home page in the background so it looks exactly like clicking a product from the home page.
    return <Home />;
};

export default ProductDetailPage;
