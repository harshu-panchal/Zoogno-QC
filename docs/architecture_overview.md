# Architecture Overview

Zoognu Quick Commerce is a microservices-inspired monolithic application designed for scale, real-time tracking, and high concurrency. It is divided into an Express API Backend and a React Frontend.

## High-Level Topology

```mermaid
graph TD
    Client[React Frontend] --> |REST/WS| ALB[Load Balancer / Ingress]
    
    subgraph "Backend System"
        ALB --> API[Express API Server]
        API --> DB[(MongoDB Atlas)]
        API --> Redis[(Redis Cache/Queue)]
        
        Redis --> Worker[Bull Queue Worker]
        Redis --> Scheduler[Distributed Scheduler]
        
        Worker --> DB
        Scheduler --> DB
    end
    
    subgraph "External Integrations"
        API --> PhonePe[PhonePe Gateway]
        API --> Firebase[Firebase SDK]
        API --> Maps[Google Maps API]
    end
```

## Core Components
- **API Server (`http`)**: Serves REST requests, handles real-time Socket.IO connections, manages authentication.
- **Queue Workers (`worker`)**: Offloads heavy tasks such as auto-canceling unaccepted orders, handling delivery timeouts, and push notification processing.
- **Scheduler (`scheduler`)**: A distributed job runner to manage recurring tasks like releasing payout holds or batch processing ledger entries.

## Primary Business Workflows

### Order Lifecycle

```mermaid
sequenceDiagram
    participant C as Customer
    participant API as API Server
    participant DB as Database
    participant S as Seller
    participant D as Delivery Partner
    
    C->>API: POST /api/orders/checkout (Creates Order)
    API->>DB: Save Order (Status: PENDING)
    API->>S: Socket Event: new_order
    
    S->>API: PUT /api/orders/:id/accept
    API->>DB: Update Status -> ACCEPTED
    API->>C: Socket Event: order_accepted
    
    S->>API: PUT /api/orders/:id/ready
    API->>DB: Update Status -> READY_FOR_PICKUP
    API->>D: Push Notification / Socket: order_available
    
    D->>API: PUT /api/orders/:id/assign
    API->>DB: Update Status -> ASSIGNED
    API->>C: Socket Event: delivery_assigned
    
    D->>API: PUT /api/orders/:id/picked_up
    API->>DB: Update Status -> OUT_FOR_DELIVERY
    
    D->>API: PUT /api/orders/:id/deliver
    API->>DB: Update Status -> DELIVERED
    API->>C: Push Notification: Delivered
```

## Real-Time Subsystem
The real-time tracking heavily utilizes Socket.IO. We maintain segmented rooms:
- `order_room_{orderId}`: For customers and delivery tracking.
- `seller_{sellerId}`: For seller-specific real-time notifications.
- `ticket_{ticketId}`: For real-time support chat.
