# External Integrations Summary

The Zoognu platform relies on several external APIs and SDKs to handle payments, media, tracking, and authentication.

## 1. PhonePe (Payments)
- **Purpose**: Handles all customer checkouts and secure online payments.
- **Backend Flow**:
  1. `POST /api/payments/create-order`: Initiates a transaction with PhonePe via `@phonepe-pg/pg-sdk-node`.
  2. Frontend redirects the user to the PhonePe checkout UI.
  3. **Webhook Verification**: PhonePe sends an S2S POST callback to `/api/payments/webhook/phonepe`.
  4. The webhook verifies the `x-verify` checksum using the `PHONEPE_WEBHOOK_SECRET` before updating the `Order` and `Ledger` status.

## 2. Firebase SDK
- **Purpose**: Multi-channel communications and OTPs.
- **Firebase Admin (Backend)**: Used heavily to dispatch FCM (Firebase Cloud Messaging) Push Notifications to specific seller or delivery apps when order states change.
- **Firebase Web (Frontend)**: Employed for OTP (One-Time Password) generation/verification during authentication flows.

## 3. Google Maps APIs
- **Purpose**: Geolocation, reverse-geocoding, and routing.
- **Backend SDK (`@googlemaps/google-maps-services-js`)**: Validates addresses and calculates ETA matrices. Employs a custom `GeocodeCache` model to prevent redundant API calls and reduce billing.
- **Frontend SDK (`@react-google-maps/api`)**: Renders interactive maps for:
  1. Customers selecting their precise delivery pin.
  2. Delivery personnel tracking the route to the customer (via polyline decoding).

## 4. Cloudinary
- **Purpose**: Asset management and image optimization.
- **Usage**: Product images, Seller verification documents, Customer avatars. Files are temporarily uploaded to the server via `multer`, pushed to Cloudinary via their Node SDK, and then the secure URLs are saved to MongoDB.

## 5. SMS Hub
- **Purpose**: Fallback or primary SMS gateway for sending OTPs if Firebase SMS limits are hit or specifically customized templates are required (e.g., India specific DLT requirements).
