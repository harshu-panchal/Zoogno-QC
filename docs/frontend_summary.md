# Frontend Technical Summary

The Zoognu Quick Commerce frontend is a React application built with Vite. It features a modern, animated UI employing Tailwind CSS, Framer Motion, and Radix UI components. 

## Architectural Principles
1. **Module-Based Design**: The application is highly segmented into domain-specific modules (`admin`, `customer`, `seller`, `delivery`).
2. **Role-Based Routing**: Strict separation of user sessions using `<RoleGuard>` and `<ProtectedRoute>` wrappers in `AppRouter.jsx`.
3. **Lazy Loading**: Heavy modules and views are asynchronously imported (`React.lazy()`) to reduce the initial bundle size and optimize time-to-interactive (TTI).

## Core Technologies
- **Framework**: React 19 + Vite
- **Routing**: React Router DOM
- **Global State**: Context API (`AuthContext`, `CartContext`, `WishlistContext`, etc.)
- **Styling**: Tailwind CSS for utility-first styling, customized in `tailwind.config.js` with semantic variables.
- **Animations**: Framer Motion for complex orchestrations; Tailwind plugins (`tailwindcss-animate`) for micro-interactions.
- **Maps Integration**: `@react-google-maps/api` for delivery tracking and address selection.

## State Management Strategy
The application relies on React Context rather than Redux for state management, organized by domain:
- `AuthContext`: Manages JWTs, active roles, and authentication status.
- `CartContext` & `WishlistContext`: Handles local caching and API syncing for e-commerce features.
- `SettingsContext`: Manages global platform settings fetched from the backend.
- `SupportUnreadContext`: Polls and caches unread ticket/chat notifications.

## Key Modules Breakdown

### 1. Customer Module (`src/modules/customer`)
The most complex module, housing the e-commerce storefront.
- **Features**: Product discovery (Categories, Search), Cart & Checkout (PhonePe integration), Order Tracking (Live Maps), Support Chat.
- **Contexts Specific**: `ProductDetailContext`, `CartAnimationContext`, `LocationContext`.

### 2. Seller Module (`src/modules/seller`)
A dedicated dashboard for merchants.
- **Features**: Catalog management (Products, Variations), Order fulfillment workflows (Accepting, marking as ready), Financial overviews.
- **Guards**: Restricted entirely to users possessing the `SELLER` role.

### 3. Delivery Module (`src/modules/delivery`)
A specialized UI for delivery personnel.
- **Features**: Live location broadcasting (Socket.IO + Google Maps), Order assignment lists, Fulfillment flow (Picked up -> Delivered).

### 4. Admin Module (`src/modules/admin`)
The super-admin panel for platform oversight.
- **Features**: System metrics and dashboard, User role management, Global settings, Financial auditing, and global support ticket resolution.
