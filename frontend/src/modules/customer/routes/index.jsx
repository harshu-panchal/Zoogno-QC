import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

import ScrollToTop from '../components/shared/ScrollToTop';
import { WishlistProvider } from '../context/WishlistContext';
import { CartProvider } from '../context/CartContext';
import { CartAnimationProvider } from '../context/CartAnimationContext';
import { LocationProvider } from '../context/LocationContext';
import ProtectedRoute from '../../../core/guards/ProtectedRoute';
import Loader from '../../../shared/components/ui/Loader';
import { lazyWithRetry as lazy } from "../../../shared/utils/lazyWithRetry";

const Home = lazy(() => import('../pages/Home'));
const CategoriesPage = lazy(() => import('../pages/CategoriesPage'));
const CategoryProductsPage = lazy(() => import('../pages/CategoryProductsPage'));
const WishlistPage = lazy(() => import('../pages/WishlistPage'));
const CartPage = lazy(() => import('../pages/CartPage'));
const OffersPage = lazy(() => import('../pages/OffersPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const OrdersPage = lazy(() => import('../pages/OrdersPage'));
const OrderTransactionsPage = lazy(() => import('../pages/OrderTransactionsPage'));
const AddressesPage = lazy(() => import('../pages/AddressesPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const SupportPage = lazy(() => import('../pages/SupportPage'));
const ChatPage = lazy(() => import('../pages/ChatPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const EditProfilePage = lazy(() => import('../pages/EditProfilePage'));
const OrderDetailPage = lazy(() => import('../pages/OrderDetailPage'));
const ProductDetailPage = lazy(() => import('../pages/ProductDetailPage'));
const CheckoutPage = lazy(() => import('../pages/CheckoutPage'));
const PaymentStatusPage = lazy(() => import('../pages/PaymentStatusPage'));

const PageLoader = () => (
    <div className="flex items-center justify-center min-h-[50vh]">
        <Loader size="large" />
    </div>
);

const CustomerRoutes = () => {
    return (
        <LocationProvider>
            <WishlistProvider>
                <CartProvider>
                    <CartAnimationProvider>
                        <ScrollToTop />
                        <Suspense fallback={<PageLoader />}>
                            <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="categories" element={<CategoriesPage />} />
                                <Route path="category/:categoryName" element={<CategoryProductsPage />} />
                                <Route path="product/:id" element={<ProductDetailPage />} />
                                <Route path="terms" element={<TermsPage />} />
                                <Route path="privacy" element={<PrivacyPage />} />
                                <Route path="about" element={<AboutPage />} />
                                <Route path="offers" element={<OffersPage />} />

                                {/* Protected Customer Routes */}
                                <Route path="wishlist" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
                                <Route path="orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
                                <Route path="orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                                <Route path="transactions" element={<ProtectedRoute><OrderTransactionsPage /></ProtectedRoute>} />
                                <Route path="addresses" element={<ProtectedRoute><AddressesPage /></ProtectedRoute>} />
                                <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                                <Route path="support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
                                <Route path="chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                                <Route path="checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                                <Route path="payment-status" element={<ProtectedRoute><PaymentStatusPage /></ProtectedRoute>} />
                                <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                                <Route path="profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
                            </Routes>
                        </Suspense>
                    </CartAnimationProvider>
                </CartProvider>
            </WishlistProvider>
        </LocationProvider>
    );
};

export default CustomerRoutes;
