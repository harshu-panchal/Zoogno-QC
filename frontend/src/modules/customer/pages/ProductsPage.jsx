import React, { useState, useEffect } from 'react';
import { useLocation as useAppLocation } from '../context/LocationContext';
import { customerApi } from '../services/customerApi';
import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import SEO from '@core/components/SEO';
import { Loader2 } from 'lucide-react';

const ProductsPage = () => {
    const { currentLocation } = useAppLocation();
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchProducts = async () => {
        setIsLoading(true);
        try {
            const hasValidLocation =
                Number.isFinite(currentLocation?.latitude) &&
                Number.isFinite(currentLocation?.longitude);

            const prodRes = await (hasValidLocation
                ? customerApi.getProducts({
                    lat: currentLocation.latitude,
                    lng: currentLocation.longitude,
                })
                : customerApi.getProducts({}));

            if (prodRes.data.success) {
                const rawResult = prodRes.data.result;
                const dbProds = Array.isArray(prodRes.data.results)
                    ? prodRes.data.results
                    : Array.isArray(rawResult?.items)
                        ? rawResult.items
                        : Array.isArray(rawResult)
                            ? rawResult
                            : [];

                const formattedProds = dbProds.map(p => ({
                    ...p,
                    id: p._id,
                    image:
                        p.mainImage ||
                        p.image ||
                        "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
                    price: p.salePrice || p.price,
                    originalPrice: p.price,
                    weight: p.weight || "1 unit",
                    deliveryTime: "8-15 mins"
                }));
                setProducts(Array.isArray(formattedProds) ? formattedProds : []);
            } else {
                setProducts([]);
            }
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    return (
        <div className="flex flex-col min-h-screen bg-white relative font-sans">
            <SEO
                title="All Products"
                description="Browse all our fresh and organic products"
            />
            
            <div className="relative z-10 py-8 w-full max-w-[1920px] mx-auto px-4 md:px-[50px] animate-in fade-in slide-in-from-bottom-4 duration-700 mt-20 md:mt-16">
                <div className="mb-8 text-left">
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-primary mb-1">All Products</h1>
                    {!isLoading && (
                        <p className="text-gray-500 text-sm md:text-lg font-medium">
                            Showing {products.length} items
                        </p>
                    )}
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="animate-spin text-primary w-10 h-10" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="w-full flex-1 py-20 px-8 flex flex-col items-center justify-center text-center">
                        <h3 className="text-3xl font-[1000] text-slate-800 tracking-tighter mb-4 uppercase">
                            No Products <span className="text-primary">Found</span>
                        </h3>
                        <p className="text-slate-500 font-bold text-sm max-w-[280px] mb-8 leading-relaxed">
                            Try checking back later or browse other categories.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                        {products.map((product) => (
                            <ProductCard key={product.id || product._id} product={product} />
                        ))}
                    </div>
                )}
            </div>
            
            <ProductDetailSheet />
        </div>
    );
};

export default ProductsPage;
