import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "@shared/layout/DashboardLayout";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";
import { useAuth } from "@core/context/AuthContext";
import {
  LayoutDashboard,
  Tag,
  Box,
  Building2,
  Truck,
  Wallet,
  Banknote,
  Receipt,
  CircleDollarSign,
  Users,
  HelpCircle,
  ClipboardList,
  RotateCcw,
  Settings,
  Terminal,
  Sparkles,
  User,
  QrCode,
  ShoppingBasket,
  ShieldCheck,
} from "lucide-react";

const Dashboard = React.lazy(() => import("../pages/Dashboard"));
const CategoryManagement = React.lazy(
  () => import("../pages/CategoryManagement"),
);
const HeaderCategories = React.lazy(
  () => import("../pages/categories/HeaderCategories"),
);
const Level2Categories = React.lazy(
  () => import("../pages/categories/Level2Categories"),
);
const SubCategories = React.lazy(
  () => import("../pages/categories/SubCategories"),
);
const CategoryHierarchy = React.lazy(
  () => import("../pages/categories/CategoryHierarchy"),
);
const ProductManagement = React.lazy(
  () => import("../pages/ProductManagement"),
);
const ActiveSellers = React.lazy(() => import("../pages/ActiveSellers"));
const PendingSellers = React.lazy(() => import("../pages/PendingSellers"));
const SellerLocations = React.lazy(() => import("../pages/SellerLocations"));
const ActiveDeliveryBoys = React.lazy(
  () => import("../pages/ActiveDeliveryBoys"),
);
const SosAlerts = React.lazy(() => import("../pages/SosAlerts"));
const PendingDeliveryBoys = React.lazy(
  () => import("../pages/PendingDeliveryBoys"),
);
const DeliveryFunds = React.lazy(() => import("../pages/DeliveryFunds"));
const AdminWallet = React.lazy(() => import("../pages/AdminWallet"));
const AdminEarnings = React.lazy(() => import("../pages/AdminEarnings"));
const WithdrawalRequests = React.lazy(
  () => import("../pages/WithdrawalRequests"),
);
const SellerTransactions = React.lazy(
  () => import("../pages/SellerTransactions"),
);
const CashCollection = React.lazy(() => import("../pages/CashCollection"));
const CustomerManagement = React.lazy(
  () => import("../pages/CustomerManagement"),
);
const CustomerDetail = React.lazy(() => import("../pages/CustomerDetail"));
const UserManagement = React.lazy(() => import("../pages/UserManagement"));
const Profile = React.lazy(() => import("@/pages/Profile"));
const FAQManagement = React.lazy(() => import("../pages/FAQManagement"));
const OrdersList = React.lazy(() => import("../pages/OrdersList"));
const OrderDetail = React.lazy(() => import("../pages/OrderDetail"));
const Returns = React.lazy(() => import("../pages/Returns"));
const SellerDetail = React.lazy(() => import("../pages/SellerDetail"));
const SupportTickets = React.lazy(() => import("../pages/SupportTickets"));
const ReviewModeration = React.lazy(() => import("../pages/ReviewModeration"));
const FleetTracking = React.lazy(() => import("../pages/FleetTracking"));
const CouponManagement = React.lazy(() => import("../pages/CouponManagement"));
const ContentManager = React.lazy(() => import("../pages/ContentManager"));
const HeroCategoriesPerPage = React.lazy(() => import("../pages/HeroCategoriesPerPage"));
const NotificationComposer = React.lazy(
  () => import("../pages/NotificationComposer"),
);
const OffersManagement = React.lazy(
  () => import("../pages/OffersManagement"),
);
const OfferSectionsManagement = React.lazy(
  () => import("../pages/OfferSectionsManagement"),
);
const AdminSettings = React.lazy(() => import("../pages/AdminSettings"));
const EnvSettings = React.lazy(() => import("../pages/EnvSettings"));
const AdminProfile = React.lazy(() => import("../pages/AdminProfile"));
const RoleManagement = React.lazy(() => import("../pages/RoleManagement"));
const PagesManagement = React.lazy(() => import("../pages/PagesManagement"));

const navItems = [
  {
    label: "Dashboard",
    path: "/admin",
    icon: LayoutDashboard,
    color: "indigo",
    end: true,
    permission: "dashboard",
  },
  {
    label: "Categories",
    icon: Tag,
    color: "rose",
    permission: "categories",
    children: [
      { label: "All Categories", path: "/admin/categories/hierarchy" },
      { label: "Header Categories", path: "/admin/categories/header" },
      { label: "Main Categories", path: "/admin/categories/level2" },
      { label: "Sub-Categories", path: "/admin/categories/sub" },
    ],
  },
  { label: "Products", path: "/admin/products", icon: Box, color: "amber", permission: "products" },
  {
    label: "Marketing Tools",
    icon: Sparkles,
    color: "amber",
    permission: "marketing",
    children: [
      { label: "Create Sections", path: "/admin/experience-studio" },
      { label: "Hero & categories per page", path: "/admin/hero-categories" },
      { label: "Send Notifications", path: "/admin/notifications" },
      { label: "Coupons & Promos", path: "/admin/coupons" },
      { label: "Offer Sections", path: "/admin/offer-sections" },
      { label: "Legal Pages", path: "/admin/pages" },
    ],
  },
  {
    label: "Customer Support",
    icon: Receipt,
    color: "emerald",
    permission: "support",
    children: [
      { label: "Help Tickets", path: "/admin/support-tickets" },
      { label: "Review Content", path: "/admin/moderation" },
    ],
  },
  {
    label: "Sellers",
    icon: Building2,
    color: "blue",
    permission: "sellers",
    children: [
      { label: "Active Sellers", path: "/admin/sellers/active" },
      { label: "Waiting for Review", path: "/admin/sellers/pending" },
      { label: "Seller Locations", path: "/admin/seller-locations" },
    ],
  },
  {
    label: "Delivery Drivers",
    icon: Truck,
    color: "emerald",
    permission: "delivery",
    children: [
      { label: "Active Drivers", path: "/admin/delivery-boys/active" },
      { label: "Waiting for Review", path: "/admin/delivery-boys/pending" },
      { label: "SOS Alerts", path: "/admin/sos-alerts" },
      { label: "Track Drivers", path: "/admin/tracking" },
      { label: "Send Money", path: "/admin/delivery-funds" },
      { label: "Slot Management", path: "/admin/slots" },
      { label: "Live Online Drivers", path: "/admin/online-drivers" },
      { label: "Slot Analytics", path: "/admin/slot-analytics" },
    ],
  },
  { label: "Wallet", path: "/admin/wallet", icon: Wallet, color: "violet", permission: "wallet" },
  { label: "Admin Earnings", path: "/admin/earnings", icon: Wallet, color: "green", permission: "wallet" },
  {
    label: "Money Requests",
    path: "/admin/withdrawals",
    icon: Banknote,
    color: "cyan",
    permission: "withdrawals",
  },
  {
    label: "Seller Payments",
    path: "/admin/seller-transactions",
    icon: Receipt,
    color: "orange",
    permission: "seller_payments",
  },
  {
    label: "Collect Cash",
    path: "/admin/cash-collection",
    icon: CircleDollarSign,
    color: "green",
    permission: "cash_collection",
  },
  { label: "Customers", path: "/admin/customers", icon: Users, color: "sky", permission: "customers" },
  { label: "FAQs", path: "/admin/faqs", icon: HelpCircle, color: "pink", permission: "faqs" },
  {
    label: "Orders",
    icon: ClipboardList,
    color: "fuchsia",
    permission: "orders",
    children: [
      { label: "All Orders", path: "/admin/orders/all" },
      { label: "New Orders", path: "/admin/orders/pending" },
      { label: "Being Prepared", path: "/admin/orders/processed" },
      { label: "On the Way", path: "/admin/orders/out-for-delivery" },
      { label: "Delivered", path: "/admin/orders/delivered" },
      { label: "Cancelled", path: "/admin/orders/cancelled" },
      { label: "Returned", path: "/admin/orders/returned" },
      { label: "Return Requests", path: "/admin/returns" },
    ],
  },
  {
    label: "QR Bag Management",
    icon: QrCode,
    color: "violet",
    permission: "qr_bags",
    children: [
      { label: "Bag Inventory", path: "/admin/qr-bags/inventory" },
      { label: "Generate QR Bags", path: "/admin/qr-bags/generate" },
      { label: "Assign to Sellers", path: "/admin/qr-bags/assign" },
      { label: "Bag Requests", path: "/admin/qr-bags/requests" },
      { label: "Bag Payments", path: "/admin/qr-bags/billing" },
    ],
  },
  {
    label: "Basket Management",
    icon: ShoppingBasket,
    color: "teal",
    permission: "baskets",
    children: [
      { label: "Basket Dashboard", path: "/admin/baskets" },
      { label: "Basket Requests", path: "/admin/baskets/requests" },
      { label: "Create Baskets", path: "/admin/baskets/create" },
      { label: "Assign to Sellers", path: "/admin/baskets/assign" },
    ],
  },
  {
    label: "Fees & Charges",
    icon: RotateCcw,
    color: "red",
    permission: "billing",
    children: [
      { label: "Billing Charges", path: "/admin/billing" },
      { label: "Surge Charges", path: "/admin/surge-charges" },
    ]
  },
  {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    color: "slate",
    permission: "settings",
  },
  { label: "My Profile", path: "/admin/profile", icon: User, color: "indigo" }, // Profile is public
  { label: "System Settings", path: "/admin/env", icon: Terminal, color: "dark", permission: "system_settings" },
  { label: "Role Management", path: "/admin/role-management", icon: ShieldCheck, color: "rose", permission: "all" }, // Role Management requires all/Super Admin
];

const BillingCharges = React.lazy(() => import("../pages/BillingCharges"));
const SurgeCharges = React.lazy(() => import("../pages/SurgeCharges"));

// QR Bag Management (lazy)
const QRBagInventory = React.lazy(() => import("../pages/QRBagInventory"));
const QRBagGenerate = React.lazy(() => import("../pages/QRBagGenerate"));
const QRBagAssign = React.lazy(() => import("../pages/QRBagAssign"));
const QRBagRequests = React.lazy(() => import("../pages/QRBagRequests"));
const BagBilling = React.lazy(() => import("../pages/BagBilling"));

// Basket Management (lazy)
const BasketDashboard = React.lazy(() => import("../pages/BasketDashboard"));
const BasketCreate = React.lazy(() => import("../pages/BasketCreate"));
const BasketAssign = React.lazy(() => import("../pages/BasketAssign"));
const BasketLostDamaged = React.lazy(() => import("../pages/BasketLostDamaged"));
const BasketRequests = React.lazy(() => import("../pages/BasketRequests"));

// Slot Management (lazy)
const SlotManagement = React.lazy(() => import("../pages/SlotManagement"));
const OnlineDrivers = React.lazy(() => import("../pages/OnlineDrivers"));
const SlotAnalytics = React.lazy(() => import("../pages/SlotAnalytics"));

const AdminRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.ADMIN);
  }, []);

  const { totalUnread } = useSupportUnread();
  const { user } = useAuth();

  const permissions = React.useMemo(() => {
    if (!user) return [];
    // Super admins / Primary admins have full access
    if (
      user.email === "zoogno61@gmail.com" ||
      user.email === "superadmin@zoognu.com" ||
      !user.adminRole
    ) {
      return ["all"];
    }
    return user.adminRole.permissions || [];
  }, [user]);

  const hasAccess = React.useCallback((permission) => {
    if (permissions.includes("all")) return true;
    return permissions.includes(permission);
  }, [permissions]);

  const filteredNavItems = React.useMemo(() => {
    return navItems.filter((item) => {
      if (!item.permission) return true;
      return hasAccess(item.permission);
    });
  }, [hasAccess]);

  const navItemsWithBadges = React.useMemo(() => {
    const count = Number.isFinite(totalUnread) ? totalUnread : 0;
    if (count <= 0) return filteredNavItems;
    return filteredNavItems.map((item) => {
      if (item?.label !== "Customer Support") return item;
      return { ...item, badgeCount: count };
    });
  }, [totalUnread, filteredNavItems]);

  return (
    <div className="admin-btn-override contents">
      <DashboardLayout navItems={navItemsWithBadges} title="Admin Center">
        <Routes>
          <Route path="/" element={hasAccess("dashboard") ? <Dashboard /> : <Navigate to="/admin/profile" replace />} />
        <Route path="/users" element={hasAccess("customers") ? <UserManagement /> : <Navigate to="/" replace />} />
        <Route path="/profile" element={<AdminProfile />} />
        {/* Lazy routes for new sections */}
        <Route
          path="/categories"
          element={hasAccess("categories") ? <Navigate to="/admin/categories/header" replace /> : <Navigate to="/" replace />}
        />
        <Route path="/categories/header" element={hasAccess("categories") ? <HeaderCategories /> : <Navigate to="/" replace />} />
        <Route path="/categories/level2" element={hasAccess("categories") ? <Level2Categories /> : <Navigate to="/" replace />} />
        <Route path="/categories/sub" element={hasAccess("categories") ? <SubCategories /> : <Navigate to="/" replace />} />
        <Route path="/categories/hierarchy" element={hasAccess("categories") ? <CategoryHierarchy /> : <Navigate to="/" replace />} />
        <Route path="/products" element={hasAccess("products") ? <ProductManagement /> : <Navigate to="/" replace />} />
        <Route path="/sellers/active" element={hasAccess("sellers") ? <ActiveSellers /> : <Navigate to="/" replace />} />
        <Route path="/sellers/active/:id" element={hasAccess("sellers") ? <SellerDetail /> : <Navigate to="/" replace />} />
        <Route path="/support-tickets" element={hasAccess("support") ? <SupportTickets /> : <Navigate to="/" replace />} />
        <Route path="/moderation" element={hasAccess("support") ? <ReviewModeration /> : <Navigate to="/" replace />} />
        <Route path="/experience-studio" element={hasAccess("marketing") ? <ContentManager /> : <Navigate to="/" replace />} />
        <Route path="/hero-categories" element={hasAccess("marketing") ? <HeroCategoriesPerPage /> : <Navigate to="/" replace />} />
        <Route path="/notifications" element={hasAccess("marketing") ? <NotificationComposer /> : <Navigate to="/" replace />} />
        <Route path="/offers" element={hasAccess("marketing") ? <OffersManagement /> : <Navigate to="/" replace />} />
        <Route path="/offer-sections" element={hasAccess("marketing") ? <OfferSectionsManagement /> : <Navigate to="/" replace />} />
        <Route path="/coupons" element={hasAccess("marketing") ? <CouponManagement /> : <Navigate to="/" replace />} />
        <Route path="/pages" element={hasAccess("marketing") ? <PagesManagement /> : <Navigate to="/" replace />} />
        <Route path="/sellers/pending" element={hasAccess("sellers") ? <PendingSellers /> : <Navigate to="/" replace />} />
        <Route path="/seller-locations" element={hasAccess("sellers") ? <SellerLocations /> : <Navigate to="/" replace />} />
        <Route path="/delivery-boys/active" element={hasAccess("delivery") ? <ActiveDeliveryBoys /> : <Navigate to="/" replace />} />
        <Route path="/sos-alerts" element={hasAccess("delivery") ? <SosAlerts /> : <Navigate to="/" replace />} />
        <Route
          path="/delivery-boys/pending"
          element={hasAccess("delivery") ? <PendingDeliveryBoys /> : <Navigate to="/" replace />}
        />
        <Route path="/tracking" element={hasAccess("delivery") ? <FleetTracking /> : <Navigate to="/" replace />} />
        <Route path="/delivery-funds" element={hasAccess("delivery") ? <DeliveryFunds /> : <Navigate to="/" replace />} />
        
        {/* Slot Management */}
        <Route path="/slots" element={hasAccess("delivery") ? <SlotManagement /> : <Navigate to="/" replace />} />
        <Route path="/online-drivers" element={hasAccess("delivery") ? <OnlineDrivers /> : <Navigate to="/" replace />} />
        <Route path="/slot-analytics" element={hasAccess("delivery") ? <SlotAnalytics /> : <Navigate to="/" replace />} />
        
        <Route path="/wallet" element={hasAccess("wallet") ? <AdminWallet /> : <Navigate to="/" replace />} />
        <Route path="/earnings" element={hasAccess("wallet") ? <AdminEarnings /> : <Navigate to="/" replace />} />
        <Route path="/withdrawals" element={hasAccess("withdrawals") ? <WithdrawalRequests /> : <Navigate to="/" replace />} />
        <Route path="/seller-transactions" element={hasAccess("seller_payments") ? <SellerTransactions /> : <Navigate to="/" replace />} />
        <Route path="/cash-collection" element={hasAccess("cash_collection") ? <CashCollection /> : <Navigate to="/" replace />} />
        <Route path="/customers" element={hasAccess("customers") ? <CustomerManagement /> : <Navigate to="/" replace />} />
        <Route path="/customers/:id" element={hasAccess("customers") ? <CustomerDetail /> : <Navigate to="/" replace />} />
        <Route path="/faqs" element={hasAccess("faqs") ? <FAQManagement /> : <Navigate to="/" replace />} />
        <Route path="/orders/:status" element={hasAccess("orders") ? <OrdersList /> : <Navigate to="/" replace />} />
        <Route path="/orders/view/:orderId" element={hasAccess("orders") ? <OrderDetail /> : <Navigate to="/" replace />} />
        <Route path="/returns" element={hasAccess("orders") ? <Returns /> : <Navigate to="/" replace />} />
        <Route path="/billing" element={hasAccess("billing") ? <BillingCharges /> : <Navigate to="/" replace />} />
        <Route path="/surge-charges" element={hasAccess("billing") ? <SurgeCharges /> : <Navigate to="/" replace />} />
        <Route path="/settings" element={hasAccess("settings") ? <AdminSettings /> : <Navigate to="/" replace />} />
        <Route path="/env" element={hasAccess("system_settings") ? <EnvSettings /> : <Navigate to="/" replace />} />
        <Route path="/role-management" element={hasAccess("all") ? <RoleManagement /> : <Navigate to="/" replace />} />
        {/* QR Bag Management Routes */}
        <Route path="/qr-bags/inventory" element={hasAccess("qr_bags") ? <QRBagInventory /> : <Navigate to="/" replace />} />
        <Route path="/qr-bags/generate" element={hasAccess("qr_bags") ? <QRBagGenerate /> : <Navigate to="/" replace />} />
        <Route path="/qr-bags/assign" element={hasAccess("qr_bags") ? <QRBagAssign /> : <Navigate to="/" replace />} />
        <Route path="/qr-bags/requests" element={hasAccess("qr_bags") ? <QRBagRequests /> : <Navigate to="/" replace />} />
        <Route path="/qr-bags/billing" element={hasAccess("qr_bags") ? <BagBilling /> : <Navigate to="/" replace />} />
        {/* Basket Management Routes */}
        <Route path="/baskets" element={hasAccess("baskets") ? <BasketDashboard /> : <Navigate to="/" replace />} />
        <Route path="/baskets/requests" element={hasAccess("baskets") ? <BasketRequests /> : <Navigate to="/" replace />} />
        <Route path="/baskets/create" element={hasAccess("baskets") ? <BasketCreate /> : <Navigate to="/" replace />} />
        <Route path="/baskets/assign" element={hasAccess("baskets") ? <BasketAssign /> : <Navigate to="/" replace />} />
        <Route path="/baskets/lost" element={hasAccess("baskets") ? <BasketLostDamaged /> : <Navigate to="/" replace />} />
        {/* System & Access */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DashboardLayout>
    </div>
  );
};

export default AdminRoutes;
