# Doorstep Rejection (RTO) and On-the-Spot Delivery Returns

This plan outlines the architecture for two main flows:
1. **RTO (Doorstep Rejection / Fraud)** by delivery agents.
2. **On-the-spot Returns (Damaged / Expired)** for non-returnable items during delivery.

## User Review Required
> [!IMPORTANT]
> - Please confirm how we should handle the **COD penalty**. Should we allow the customer's `walletBalance` to go **negative**, meaning they must clear it during their next purchase, or should we create a separate `pendingDues` field in the `User` (Customer) model?
> - For **Prepaid** RTOs, should the refund of the remaining amount go **exclusively** to the customer's wallet, or back to the original payment method?
> - When the Delivery boy marks the order as RTO, should the order immediately become a `return_in_transit` to the seller with the *current* delivery boy assigned, or should it broadcast to find a new rider? (Assuming the *current* rider returns it since they already have the item).

## Open Questions
> [!WARNING]
> - Should we calculate the 18% GST on the *combined* total of (Shipping Fee + Platform Fee) or are they already inclusive of GST?
> - For the **Seller penalty** on Damaged/Expired returns (Forward + Reverse fees + 18% GST), how is the "Reverse Fee" calculated? Do we have a standard reverse fee rate in the settings, or should we use the forward delivery fee amount?
> - Should the customer still pay the full order amount for the *accepted* items when they do an on-the-spot partial return?

## Proposed Changes

### `backend/app/models/customer.js`
#### [MODIFY] [customer.js](file:///c:/Users/victus/Desktop/zoognu/backend/app/models/customer.js)
- Add a `pendingDues` field (type: Number, default: 0) to track unpaid penalties from COD doorstep rejections.

---

### `backend/app/models/order.js`
#### [MODIFY] [order.js](file:///c:/Users/victus/Desktop/zoognu/backend/app/models/order.js)
- Add a new status enum value for RTO: `rto_in_transit`, `rto_returned`.
- Add `rtoReason` field to capture if it was doorstep rejection or fraud.
- Add `onTheSpotReturn` metadata in `returnItems` to flag items returned immediately.

---

### `backend/app/controller/deliveryController.js`
#### [MODIFY] [deliveryController.js](file:///c:/Users/victus/Desktop/zoognu/backend/app/controller/deliveryController.js)
- Add an API endpoint `markOrderRto` that:
  - Updates order status to `rto_in_transit` (or uses the existing `return_in_transit`).
  - Sets the delivery boy as the `returnDeliveryBoy`.
  - Calculates the penalty (Shipping + Platform Fee + 18% GST).
  - Handles Customer Pricing (Prepaid refund minus penalty to Wallet OR COD penalty added to Customer dues).
  - Triggers the existing `requestReturnDropOtp` to send OTP to the seller.
- Add an API endpoint `markOnTheSpotReturn` that:
  - Takes selected items and reason (Damaged/Expired).
  - Converts those items into a Return request.
  - Updates the order total/pricing for the customer.
  - Charges the seller (Forward + Reverse + 18% GST).

---

### `backend/app/services/finance/orderFinanceService.js`
#### [MODIFY] [orderFinanceService.js](file:///c:/Users/victus/Desktop/zoognu/backend/app/services/finance/orderFinanceService.js)
- Add functions to handle RTO penalty deduction and wallet credits.
- Add logic to charge the seller for Damaged/Expired returns (deducting from their wallet or pending payouts).

---

### `frontend/src/modules/delivery/` (If Applicable)
#### [NEW] Delivery UI Updates
- Since the backend changes will require frontend triggers, the delivery app/screens will need a "Mark RTO" button and an "On-the-spot Return" flow where they can select items.

## Verification Plan

### Automated Tests
- Test RTO calculation logic (100% shipping + platform + 18% GST).
- Test Prepaid wallet refund calculation.
- Test COD `pendingDues` logic.
- Test Seller fee deduction for Damaged/Expired.

### Manual Verification
- Log in as Delivery Partner, assign a pending order.
- Attempt to mark as RTO -> Check if OTP is sent to Seller -> Check Customer Wallet/Dues.
- Attempt a partial On-the-Spot Return -> Complete the delivery -> Check Seller Ledger for the penalty deduction.
