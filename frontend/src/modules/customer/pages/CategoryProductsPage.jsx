import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Heart, Search, Minus, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '@shared/components/ui/Toast';
import { cn } from '@/lib/utils';
import { applyCloudinaryTransform } from '@/core/utils/imageUtils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import SectionRenderer from "../components/experience/SectionRenderer";
import { useLocation as useAppLocation } from '../context/LocationContext';
import { useSettings } from '@core/context/SettingsContext';
import Lottie from 'lottie-react';
import SEO from '@core/components/SEO';

const PRODUCTS_PAGE_SIZE = 30;
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400";

function formatProduct(p) {
    return {
        ...p,
        id: p._id,
        image: p.mainImage || p.image || FALLBACK_IMAGE,
        price: p.salePrice || p.price,
        originalPrice: p.price,
        weight: p.weight || "1 unit",
        deliveryTime: p.sellerId?.estimatedDeliveryTime || "8-15 mins",
        variants: p.variants || [],
        shopName: p.sellerId?.shopName || p.shopName || "Unknown",
    };
}

const CategoryProductsPage = () => {
    const { categoryName: catId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const sellerId = searchParams.get("sellerId");
    const sort = searchParams.get("sort");
    const type = searchParams.get("type");
    const { currentLocation } = useAppLocation();
    const { settings } = useSettings();
    const initialSubcategoryId = location.state?.activeSubcategoryId || 'all';
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const [selectedSubCategory, setSelectedSubCategory] = useState(initialSubcategoryId);
    const [category, setCategory] = useState(null);
    const [subCategories, setSubCategories] = useState([{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png' }]);
    const [products, setProducts] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const requestTokenRef = useRef(0);

    const buildProductParams = useCallback((pageNum) => {
        const productParams = {
            lat: currentLocation.latitude,
            lng: currentLocation.longitude,
            page: pageNum,
            limit: PRODUCTS_PAGE_SIZE,
        };
        if (type === "header") {
            productParams.headerId = catId;
            if (selectedSubCategory !== 'all') productParams.categoryId = selectedSubCategory;
        } else {
            if (catId !== "all") productParams.categoryId = catId;
            if (selectedSubCategory !== 'all') productParams.subcategoryId = selectedSubCategory;
        }
        if (sellerId) productParams.sellerId = sellerId;
        if (sort) productParams.sort = sort;
        return productParams;
    }, [currentLocation.latitude, currentLocation.longitude, type, catId, selectedSubCategory, sellerId, sort]);

    const fetchProducts = useCallback(async (pageNum, { append }) => {
        const hasValidLocation =
            Number.isFinite(currentLocation?.latitude) &&
            Number.isFinite(currentLocation?.longitude);
        if (!hasValidLocation) {
            if (!append) setProducts([]);
            return;
        }

        const token = ++requestTokenRef.current;
        if (append) setIsLoadingMore(true);
        else setIsLoading(true);

        try {
            const prodRes = await customerApi.getProducts(buildProductParams(pageNum));
            if (token !== requestTokenRef.current) return; // a newer request superseded this one

            if (prodRes.data.success) {
                const rawResult = prodRes.data.result;
                const dbProds = Array.isArray(prodRes.data.results)
                    ? prodRes.data.results
                    : Array.isArray(rawResult?.items)
                        ? rawResult.items
                        : Array.isArray(rawResult)
                            ? rawResult
                            : [];
                const formatted = dbProds.map(formatProduct);

                setProducts(prev => (append ? [...prev, ...formatted] : formatted));
                setTotalCount(Number(rawResult?.total) || formatted.length);
                setTotalPages(Number(rawResult?.totalPages) || 1);
                setPage(pageNum);
            } else if (!append) {
                setProducts([]);
                setTotalCount(0);
                setTotalPages(1);
            }
        } catch (error) {
            console.error("Error fetching category products:", error);
            if (!append) setProducts([]);
        } finally {
            if (token === requestTokenRef.current) {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        }
    }, [currentLocation, buildProductParams]);

    const fetchCategoryTree = useCallback(async () => {
        try {
            const catRes = await customerApi.getCategories({ tree: true });
            if (!catRes.data.success) return;
            const tree = catRes.data.results || catRes.data.result || [];
            let currentCat = null;
            if (type === "header") {
                currentCat = tree.find(h => h._id === catId);
            } else {
                for (const header of tree) {
                    const found = (header.children || []).find(c => c._id === catId);
                    if (found) {
                        currentCat = found;
                        break;
                    }
                }
            }

            if (currentCat) {
                setCategory(currentCat);
                const subs = (currentCat.children || []).map(s => ({
                    id: s._id,
                    name: s.name,
                    icon: s.image || 'https://cdn-icons-png.flaticon.com/128/2321/2321801.png'
                }));
                setSubCategories([{ id: 'all', name: 'All', icon: 'https://cdn-icons-png.flaticon.com/128/2321/2321831.png' }, ...subs]);
            }
        } catch (error) {
            console.error("Error fetching category tree:", error);
        }
    }, [type, catId]);

    // Reset to page 1 and refetch whenever the effective filter changes —
    // including subcategory, which used to only re-filter an already-fetched
    // 1000-product blob client-side. Filtering now happens server-side via
    // categoryId/subcategoryId, so switching subcategories fetches exactly
    // what's needed instead of holding the whole category in memory.
    useEffect(() => {
        setSelectedSubCategory(location.state?.activeSubcategoryId || 'all');
    }, [catId, location.state?.activeSubcategoryId]);

    useEffect(() => {
        fetchCategoryTree();
    }, [fetchCategoryTree]);

    useEffect(() => {
        fetchProducts(1, { append: false });
    }, [fetchProducts]);

    const sentinelRef = useRef(null);
    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return undefined;
        if (isLoading || isLoadingMore || page >= totalPages) return undefined;

        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                fetchProducts(page + 1, { append: true });
            }
        }, { rootMargin: "600px" });

        observer.observe(node);
        return () => observer.disconnect();
    }, [isLoading, isLoadingMore, page, totalPages, fetchProducts]);

    const safeProducts = Array.isArray(products) ? products : [];

    return (
        <div className="flex flex-col min-h-screen bg-white relative font-sans">
            <SEO
                title={category?.name || "Category Products"}
                description={`Browse products in ${category?.name || "this category"}`}
            />
            {/* Header */}
            <header className={cn(
                "sticky top-0 z-50 bg-white border-b border-gray-50 px-4 py-4 flex items-center justify-between",
                isProductDetailOpen && "hidden md:flex"
            )}>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 hover:bg-gray-50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} className="text-gray-900" />
                    </button>
                    <h1 className="text-[18px] font-bold text-gray-800 tracking-tight">
                        {category?.name || catId}
                    </h1>
                </div>
                <div className="text-sm font-medium text-gray-500">
                    Total product is {totalCount}
                </div>
            </header>

            <div className="flex flex-1 relative items-start">
                {(safeProducts.length === 0 && !isLoading) ? (
                    <div className="w-full flex-1 py-20 px-8 flex flex-col items-center justify-center text-center">
                        <div className="w-64 h-64 mb-6 rounded-3xl overflow-hidden">
                            <video
                                src="/coming-soon-animation-gif-download-10839535.mp4"
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                            No <span className="text-primary">Products</span>
                        </h3>
                        <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                            We couldn't find any products in this category at your current location. Check back later!
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-black/10"
                        >
                            Continue Shopping
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Sidebar */}
                        <aside className="w-[70px] md:w-64 border-r border-gray-50 flex flex-col bg-white overflow-y-auto hide-scrollbar sticky top-[60px] h-[calc(100vh-60px)] pb-32 flex-shrink-0">
                            {subCategories.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedSubCategory(cat.id)}
                                    className={cn(
                                        "flex flex-col md:flex-row items-center py-4 px-1 md:px-4 gap-2 md:gap-4 transition-all relative border-l-4",
                                        selectedSubCategory === cat.id
                                            ? "bg-[#F7FCF5] border-primary"
                                            : "border-transparent hover:bg-gray-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-14 h-14 md:w-12 md:h-12 rounded-2xl flex items-center justify-center p-1.5 transition-all duration-300 flex-shrink-0",
                                        selectedSubCategory === cat.id ? "scale-110" : "opacity-100"
                                    )}>
                                        <img src={applyCloudinaryTransform(cat.icon, "f_auto,q_auto,w_100")} alt={cat.name} loading="lazy" className="w-full h-full object-contain" />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] md:text-sm text-center md:text-left font-bold font-sans leading-tight px-1 flex-1",
                                        selectedSubCategory === cat.id ? "text-primary" : "text-gray-600"
                                    )}>
                                        {cat.name}
                                    </span>
                                </button>
                            ))}
                        </aside>

                        {/* Content */}
                        <main className="flex-1 p-2 md:p-6 pb-24 bg-white space-y-4 overflow-x-hidden">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-2 gap-y-3 md:gap-4 lg:gap-6">
                                {safeProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                                ))}
                            </div>

                            {/* Infinite-scroll sentinel — loads the next page instead of
                                fetching all matching products (up to 1000) up front. */}
                            {page < totalPages && (
                                <div ref={sentinelRef} className="w-full flex items-center justify-center py-6">
                                    {isLoadingMore && (
                                        <Loader2 className="w-6 h-6 text-primary animate-spin" />
                                    )}
                                </div>
                            )}
                        </main>
                    </>
                )}
            </div>

            <MiniCart />
            <ProductDetailSheet />

            <style dangerouslySetInnerHTML={{
                __html: `
                    .hide-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .hide-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}} />
        </div>
    );
};

export default CategoryProductsPage;
