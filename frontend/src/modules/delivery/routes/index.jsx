import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DeliveryLayout from "../layout/DeliveryLayout";
import { setActiveRole, ROLES } from "@core/auth/activeRoleStore";

import { lazyWithRetry as lazy } from "../../../shared/utils/lazyWithRetry";

const Splash = lazy(() => import("../pages/Splash"));
const DeliveryAuth = lazy(() => import("../pages/DeliveryAuth"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const OrderDetails = lazy(() => import("../pages/OrderDetails"));
const Navigation = lazy(() => import("../pages/Navigation"));
const DeliveryConfirmation = lazy(() => import("../pages/DeliveryConfirmation"));
const EarningsPage = lazy(() => import("../pages/EarningsPage"));
const EarningsHistoryPage = lazy(() => import("../pages/EarningsHistoryPage"));
const CodCash = lazy(() => import("../pages/CodCash"));
const OrderHistory = lazy(() => import("../pages/OrderHistory"));
const Profile = lazy(() => import("../pages/Profile"));
const PersonalDetails = lazy(() => import("../pages/profile/PersonalDetails"));
const VehicleInfo = lazy(() => import("../pages/profile/VehicleInfo"));
const BankAccount = lazy(() => import("../pages/profile/BankAccount"));
const Documents = lazy(() => import("../pages/profile/Documents"));
const SafetyPrivacy = lazy(() => import("../pages/profile/SafetyPrivacy"));
const HelpSupport = lazy(() => import("../pages/profile/HelpSupport"));
const Withdrawals = lazy(() => import("../pages/profile/Withdrawals"));
const Bonuses = lazy(() => import("../pages/profile/Bonuses"));
const Ratings = lazy(() => import("../pages/profile/Ratings"));
const Notifications = lazy(() => import("../pages/Notifications"));
const ServiceStatus = lazy(() => import("../pages/ServiceStatus"));
const AvailableSlots = lazy(() => import("../pages/AvailableSlots"));
const UpcomingSlots = lazy(() => import("../pages/UpcomingSlots"));
const DynamicPage = lazy(() => import("../pages/DynamicPage"));
const BasketVerification = lazy(() => import("../pages/BasketVerification"));
const BasketsInHand = lazy(() => import("../pages/BasketsInHand"));

const DeliveryRoutes = () => {
  useEffect(() => {
    setActiveRole(ROLES.DELIVERY);
  }, []);

  return (
    <Routes>
      <Route element={<DeliveryLayout />}>
        <Route path="splash" element={<Splash />} />

        <Route path="auth" element={<DeliveryAuth />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="order-details/:orderId" element={<OrderDetails />} />
        <Route path="navigation" element={<Navigation />} />
        <Route path="confirm-delivery/:orderId" element={<DeliveryConfirmation />} />
        <Route path="earnings" element={<EarningsPage />} />
        <Route path="earnings/history" element={<EarningsHistoryPage />} />
        <Route path="cod-cash" element={<CodCash />} />
        <Route path="history" element={<OrderHistory />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/personal-details" element={<PersonalDetails />} />
        <Route path="profile/vehicle-info" element={<VehicleInfo />} />
        <Route path="profile/bank-account" element={<BankAccount />} />
        <Route path="profile/documents" element={<Documents />} />
        <Route path="profile/safety-privacy" element={<SafetyPrivacy />} />
        <Route path="profile/help-support" element={<HelpSupport />} />
        <Route path="profile/withdrawals" element={<Withdrawals />} />
        <Route path="profile/bonuses" element={<Bonuses />} />
        <Route path="profile/ratings" element={<Ratings />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="basket-verify/:orderId" element={<BasketVerification />} />
        <Route path="baskets-in-hand" element={<BasketsInHand />} />

        {/* Dynamic Pages */}
        <Route path="page/:slug" element={<DynamicPage />} />

        {/* Slot Routes */}
        <Route path="status" element={<ServiceStatus />} />
        <Route path="slots/available" element={<AvailableSlots />} />
        <Route path="slots/upcoming" element={<UpcomingSlots />} />

        <Route path="/" element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
};

export default DeliveryRoutes;
