import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import Orders from "../pages/Orders";
import { lazyWithRetry as lazy } from "../../../shared/utils/lazyWithRetry";
import {
  HiOutlineSquares2X2,
  HiOutlineCube,
  HiOutlineCurrencyDollar,
  HiOutlineUser,
  HiOutlineTruck,
  HiOutlineArchiveBox,
  HiOutlineChartBarSquare,
  HiOutlineCreditCard,
  HiOutlineMapPin,
  HiOutlineChatBubbleLeftRight,
} from "react-icons/hi2";

const Dashboard = lazy(() => import("../pages/Dashboard"));
const ProductManagement = lazy(
  () => import("../pages/ProductManagement"),
);
const StockManagement = lazy(() => import("../pages/StockManagement"));
const AddProduct = lazy(() => import("../pages/AddProduct"));
// Note: Orders is imported eagerly above to avoid dynamic import issues
const Returns = lazy(() => import("../pages/Returns"));
const Earnings = lazy(() => import("../pages/Earnings"));
const Analytics = lazy(() => import("../pages/Analytics"));
const Transactions = lazy(() => import("../pages/Transactions"));
const DeliveryTracking = lazy(() => import("../pages/DeliveryTracking"));
const Profile = lazy(() => import("../pages/Profile"));
const Withdrawals = lazy(() => import("../pages/Withdrawals"));
const BagRequestManagement = lazy(() => import("../pages/BagRequestManagement"));
const BagInventory = lazy(() => import("../pages/BagInventory"));
const BagScanAndPack = lazy(() => import("../pages/BagScanAndPack"));
const BasketScanAndPack = lazy(() => import("../pages/BasketScanAndPack"));
const BasketInventorySeller = lazy(() => import("../pages/BasketInventorySeller"));
const BasketRequestManagement = lazy(() => import("../pages/BasketRequestManagement"));
const HelpSupport = lazy(() => import("../pages/HelpSupport"));


const navItems = [
  { label: "Dashboard", path: "/seller", icon: HiOutlineSquares2X2, end: true },
  { label: "Products", path: "/seller/products", icon: HiOutlineCube },
  { label: "Stock", path: "/seller/inventory", icon: HiOutlineArchiveBox },
  { label: "Orders", path: "/seller/orders", icon: HiOutlineTruck },
  { label: "Returns", path: "/seller/returns", icon: HiOutlineArchiveBox },
  { label: "Track Orders", path: "/seller/tracking", icon: HiOutlineMapPin },
  {
    label: "Sales Reports",
    path: "/seller/analytics",
    icon: HiOutlineChartBarSquare,
  },
  {
    label: "Money Request",
    path: "/seller/withdrawals",
    icon: HiOutlineCurrencyDollar,
  },
  {
    label: "Payment History",
    path: "/seller/transactions",
    icon: HiOutlineCreditCard,
  },
  {
    label: "Earnings",
    path: "/seller/earnings",
    icon: HiOutlineCurrencyDollar,
  },
  { label: "Profile", path: "/seller/profile", icon: HiOutlineUser },
  { label: "Help & Support", path: "/seller/support", icon: HiOutlineChatBubbleLeftRight },
  {
    label: "QR Bags",
    icon: HiOutlineArchiveBox,
    children: [
      { label: "Bag Inventory", path: "/seller/bag-inventory" },
      { label: "Scan & Pack", path: "/seller/bag-scan" },
      { label: "Request Bags", path: "/seller/bag-requests" },
    ],
  },
  {
    label: "Baskets",
    icon: HiOutlineArchiveBox,
    children: [
      { label: "Basket Inventory", path: "/seller/basket-inventory" },
      { label: "Scan & Pack (Bulky)", path: "/seller/basket-scan" },
      { label: "Request Baskets", path: "/seller/basket-requests" },
    ],
  },
];

const SellerRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.SELLER);
  }, []);

  return (
    <DashboardLayout navItems={navItems} title="Seller Panel">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<ProductManagement />} />
        <Route path="/products/add" element={<AddProduct />} />
        <Route path="/inventory" element={<StockManagement />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/tracking" element={<DeliveryTracking />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/withdrawals" element={<Withdrawals />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/support" element={<HelpSupport />} />
        <Route path="/bag-requests" element={<BagRequestManagement />} />
        <Route path="/bag-inventory" element={<BagInventory />} />
        <Route path="/bag-scan" element={<BagScanAndPack />} />
        <Route path="/basket-inventory" element={<BasketInventorySeller />} />
        <Route path="/basket-scan" element={<BasketScanAndPack />} />
        <Route path="/basket-requests" element={<BasketRequestManagement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
  );
};

export default SellerRoutes;
