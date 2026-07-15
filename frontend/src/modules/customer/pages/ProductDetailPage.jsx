import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Home from './Home';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';

const ProductDetailPage = () => {
    const { id } = useParams();
    const { openProduct, isOpen } = useProductDetail();
    const navigate = useNavigate();
    const hasOpened = useRef(false);

    useEffect(() => {
        const loadProduct = async () => {
            try {
                const res = await customerApi.getProductById(id);
                if (res.data.success) {
                    const p = res.data.result;
                    const formatted = {
                        ...p,
                        id: p._id,
                        images: [p.mainImage, ...(p.galleryImages || [])].filter(Boolean)
                    };
                    openProduct(formatted);
                    hasOpened.current = true;
                } else {
                    navigate('/', { replace: true });
                }
            } catch (err) {
                console.error("Failed to load product:", err);
                navigate('/', { replace: true });
            }
        };

        if (id && !hasOpened.current && !isOpen) {
            loadProduct();
        }
    }, [id, isOpen, navigate, openProduct]);

    useEffect(() => {
        // If the modal was opened by this page, and now it's closed, we should navigate back home.
        if (hasOpened.current && !isOpen) {
            navigate('/', { replace: true });
        }
    }, [isOpen, navigate]);

    // Render Home page in the background so it looks exactly like clicking a product from the home page.
    return <Home />;
};

export default ProductDetailPage;
