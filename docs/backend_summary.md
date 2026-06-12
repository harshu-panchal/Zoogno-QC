# Backend Technical Summary

The Zoognu backend is a high-performance Express/Node.js API designed to handle the intricate logic of a multi-sided marketplace (Customers, Sellers, Delivery).

## Architecture & Bootstrapping
The entry point (`index.js`) configures a distributed architecture where the backend can boot into specific roles determined by the `PROCESS_ROLE` environment variable:
- `api`: Serves the Express HTTP/WebSockets server.
- `worker`: Connects to Redis and processes Bull queues without handling HTTP traffic.
- `scheduler`: Runs chronological jobs (e.g., automated refunds, releasing holds).

## Data Layer
- **Database**: MongoDB (via Mongoose ORM).
- **Core Models**:
  - `Order.js`: The central entity. Tracks state transitions from `PENDING` to `DELIVERED` or `CANCELLED`.
  - `Product.js` & `Category.js`: Catalog management, supporting variations and inventory tracking.
  - `User/Role Models`: Distinct schemas for `Customer.js`, `Seller.js`, `Delivery.js`, and `Admin.js` for tight access control.
  - `LedgerEntry.js` & `Transaction.js`: Immutable financial records ensuring accurate payouts.

## Real-Time & WebSockets
Socket.IO is heavily utilized for synchronous state updates without polling:
- Implemented in `app/socket/socketManager.js`.
- Custom emitters (`orderSocketEmitter.js`, `ticketSocketEmitter.js`) decouple standard REST controllers from WebSocket logic.
- Delivery personnel transmit live GPS coordinates mapped directly to customer apps.

## Background Jobs & Queues (Redis/Bull)
Quick commerce relies heavily on strict SLA enforcement. The backend uses background jobs to guarantee these:
- **`orderAutoCancelJob.js`**: Automatically cancels orders and refunds the customer if a seller does not accept an order within a predetermined SLA (e.g., 5 minutes).
- **`sellerTimeoutQueue`**: A Bull queue handling per-order SLA expirations.
- **`returnWindowReleaseJob.js`**: Chronological job that releases funds to the seller's wallet once the customer's return window expires.

## Middleware Pipeline
Security and observability are built into the Express pipeline:
- `globalApiRateLimiter`: Defends against brute-force attacks.
- `correlationIdMiddleware`: Appends a unique UUID to every request, flowing through to logs for tracing distributed transactions.
- `structuredRequestLogger`: standardized JSON logging.
- `errorHandler`: Global exception catching, preventing server crashes and returning standardized error payloads.
