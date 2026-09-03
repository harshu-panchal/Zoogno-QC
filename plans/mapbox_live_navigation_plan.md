# Zoogno — Mapbox Live Delivery Tracking & Real-Time ETA System

**Status:** Implementation plan + build guide (dummy tokens until you provide real Mapbox credentials)  
**Scope:** Replace Google Maps as primary map/navigation engine; ship Maps + Navigation-parity + Zoogno realtime backend  
**Audience:** Developers implementing this in the Zoogno monorepo

---

## 0. Critical architecture decision (read first)

### What you have today
- **Frontend:** React + Vite web apps (Customer, Delivery Partner, Seller, Admin)
- **Live tracking:** GPS → `POST /delivery/location` → Mongo + Firebase RTDB + Socket.IO → Customer
- **Maps/routing:** Google Maps JS + Google Directions/Geocoding

### Mapbox Navigation SDK reality
| Capability | Android / iOS Navigation SDK | Web (current Zoogno stack) |
|------------|------------------------------|----------------------------|
| Turn-by-turn voice UI | Native SDK | Custom UI on Maps GL + Directions |
| Road-matched / enhanced location | Native SDK | Map Matching API + client snap |
| Off-route + auto-reroute | Native SDK | Client deviation check + Directions refresh |
| Heading-up camera | Native SDK | Mapbox GL `bearing` + follow camera |
| Traffic-aware ETA | Directions / Navigation | Directions `traffic` profile / annotations |

**Rule for this project:**
1. **Now (Web):** Implement full UX with **Mapbox Maps GL JS + Directions + Map Matching + Search/Geocoding + Zoogno backend WebSocket**. This is “Navigation-parity” on web.
2. **Later (Native apps):** When Android/iOS delivery apps ship, plug in **Mapbox Navigation SDK** for turn-by-turn; keep the **same Zoogno backend location/ETA contract** so Customer web/app does not change.

Do **not** wait for native apps to deliver live bike tracking + ETA + heading-up. Those ship on the current web Delivery + Customer panels.

---

## 1. Target system diagram

```
┌─────────────────── Delivery Partner (Web / later Native) ───────────────────┐
│  GPS watchPosition (1–3s adaptive)                                           │
│  → optional Map Matching (road snap)                                         │
│  → Mapbox Directions (route / ETA / traffic)                                 │
│  → Off-route detector → auto-reroute                                         │
│  → Heading-up camera + rotating bike puck                                    │
│  → POST /delivery/location  { lat,lng,bearing,speed,accuracy,ts,orderId,     │
│                               eta_seconds, distance_remaining, route_version}│
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────── Zoogno Backend ─────────────────────────────────────┐
│  locationThrottle (adaptive)                                                 │
│  Mapbox server: Geocode / Directions / Map Matching (secret token)           │
│  Redis: active delivery location + route_version + ETA cache                │
│  Firebase RTDB: rider + route polyline + trail (existing paths)              │
│  Socket.IO: order:{orderId} → order:location:update + order:route:update     │
│  AuthZ: customer only own order; partner only assigned order                 │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────── Customer App ───────────────────────────────────────┐
│  Socket + Firebase subscribe                                                 │
│  Smooth bike interpolate A→B                                                 │
│  Shortest-angle bearing filter                                               │
│  Route line + store/customer pins                                            │
│  Live ETA + distance remaining (from backend, NOT distance/avgSpeed)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Env variables (dummy now — replace later)

### Frontend `frontend/.env` / `.env.example`
```env
# Public token only (pk.*) — URL-restrict in Mapbox dashboard
VITE_MAPBOX_ACCESS_TOKEN=pk.dummy_zoogno_mapbox_public_token
VITE_MAPBOX_STYLE=mapbox://styles/mapbox/light-v11
# Optional custom Zoogno style after Studio publish:
# VITE_MAPBOX_STYLE=mapbox://styles/<your-username>/zoogno-green-v1
```

### Backend `backend/.env` / `.env.example`
```env
# Secret token (sk.*) — NEVER expose to frontend
MAPBOX_ACCESS_TOKEN=sk.dummy_zoogno_mapbox_secret_token
MAPS_DEFAULT_COUNTRY=IN
GEOCODE_CACHE_TTL_SEC=2592000
ROUTE_CACHE_TTL_SEC=900
ROUTE_CACHE_MATCH_THRESHOLD_METERS=150
# Live tracking
LOCATION_MIN_INTERVAL_MS=1000
LOCATION_MIN_MOVE_METERS=8
LOCATION_STATIONARY_INTERVAL_MS=8000
OFF_ROUTE_THRESHOLD_METERS=40
ETA_REFRESH_MIN_INTERVAL_MS=20000
MAPS_RL_USER_PER_MIN=30
MAPS_RL_IP_PER_MIN=60
```

### Remove after cutover
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_GOOGLE_MAPS_MAP_ID`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_MAPS_SERVER_KEY`

---

## 3. Packages

### Frontend add
- `mapbox-gl`
- `react-map-gl` (v7+ for mapbox-gl)
- `@mapbox/polyline` (decode on client; already used server-side)
- `@turf/boolean-point-in-polygon` (seller zone containment)
- `@turf/helpers` (optional)

### Frontend remove
- `@react-google-maps/api`

### Backend
- Keep `@mapbox/polyline`, `simplify-js`
- Remove `@googlemaps/google-maps-services-js`
- Use native `fetch` / existing `axios` for Mapbox REST (no SDK required)

---

## 4. File change map (exact)

### REMOVE / REPLACE
| Path | Action |
|------|--------|
| `frontend/src/core/services/googleMapsLoader.js` | Delete → `mapboxLoader.js` |
| `frontend/src/shared/constants/mapStyles.js` | Replace with Mapbox style URL helper |
| All `@react-google-maps/api` usages | Rewrite |

### NEW (core)
| Path | Role |
|------|------|
| `frontend/src/core/services/mapboxLoader.js` | Token + CSS init |
| `frontend/src/core/utils/mapGeometry.js` | Haversine, bearing, shortest-angle lerp, position interpolate |
| `frontend/src/core/utils/bearingFilter.js` | Smooth bike rotation |
| `frontend/src/core/hooks/useSmoothMarker.js` | GPS A→B animation |
| `frontend/src/core/hooks/useHeadingUpCamera.js` | Follow + pause on drag + re-center |
| `frontend/src/shared/components/map/BikeMarker.jsx` | Custom Zoogno bike + rotation |
| `frontend/src/shared/components/map/RouteLine.jsx` | GeoJSON route layer |
| `frontend/src/shared/components/map/MapPicker.jsx` | Mapbox pin picker (replace Google MapPicker) |
| `frontend/src/modules/delivery/hooks/useNavigationSession.js` | Route, off-route, reroute, ETA publish |
| `frontend/src/modules/delivery/utils/locationPublisher.js` | Adaptive GPS publish |
| `backend/app/services/mapboxClient.js` | HTTP wrapper (Directions, Matching, Geocode) |
| `backend/app/services/mapsGeocodeService.js` | Rewrite → Mapbox |
| `backend/app/services/mapsRouteService.js` | Rewrite → Mapbox Directions + traffic |
| `backend/app/services/mapsMatchingService.js` | NEW Map Matching |
| `backend/app/services/liveTrackingService.js` | Redis active location + ETA fanout |
| `backend/app/controller/mapsController.js` | + reverse-geocode |

### REWRITE (maps UI)
| Path | Panel |
|------|--------|
| `DeliveryTrackingMap.jsx` | Delivery navigation mode |
| `CustomerTrackingMap.jsx` | Customer live tracking |
| `LocationDrawer.jsx` | Search/Geocoding |
| `LocationContext.jsx` | Reverse geocode via backend |
| `LocationManagement.jsx` | Seller |
| `ZoneManagement.jsx` | Admin |
| `SellerLocations.jsx` | Admin |
| `MapPicker.jsx` | Seller auth/profile |

### KEEP UNCHANGED (realtime spine)
| Path | Why |
|------|-----|
| `deliveryNearbyService.js` | Mongo geospatial |
| `geoUtils.js` / proximity / throttle core | Local math |
| Firebase path layout | Already correct |
| Socket rooms `order:{id}` | AuthZ boundary |
| `activeLocationTracker.js` | Dual-tracker mutex |

---

## 5. Live location data model (contract)

Every published location (Socket + Firebase + Redis):

```json
{
  "order_id": "ZG10245",
  "delivery_partner_id": "DP204",
  "latitude": 20.12345,
  "longitude": 85.12345,
  "bearing": 127.4,
  "speed": 8.5,
  "accuracy": 5.2,
  "timestamp": "2026-08-29T10:00:00.000Z",
  "status": "OUT_FOR_DELIVERY",
  "eta_seconds": 420,
  "distance_remaining": 1850,
  "route_version": 8,
  "matched": true
}
```

**Backward-compatible aliases** (existing clients):
- `lat` ← `latitude`, `lng` ← `longitude`, `heading` ← `bearing`
- Socket payload: flatten under both `location: {...}` AND top-level fields so `trackingClient` works

---

## 6. Feature → implementation mapping

| # | Requirement | How we implement |
|---|-------------|------------------|
| 1 | Maps + Nav + Directions + Matching + Search + style + bike marker | Mapbox GL + REST APIs + custom nav session + Studio style later |
| 2 | Continuous GPS + adaptive publish | `locationPublisher.js` + enriched `POST /delivery/location` |
| 3 | Customer live bike + smooth move | `useSmoothMarker` + Socket/Firebase |
| 4 | Bike rotate by bearing (shortest angle) | `bearingFilter.js` |
| 5 | Heading-up map + re-center | `useHeadingUpCamera` on Delivery nav map |
| 6–7 | Route-based ETA, intelligent refresh | Mapbox Directions duration; refresh on move/off-route/period |
| 8 | Off-route → reroute | Distance-to-polyline threshold → new Directions |
| 9 | Road matching | Map Matching API / matched geometry before display + publish |
| 10 | Route line updates | Firebase `order:route` + Socket `order:route:update` |
| 11–12 | Customer / Delivery UI | Rewrite tracking maps + ETA chrome |
| 13–14 | Data model + backend | `liveTrackingService` + Redis |
| 15 | Security | Existing order rooms + token; Mapbox token URL restrict |
| 16 | Stop on DELIVERED | Clear Redis; stop GPS; unsubscribe |
| 17–20 | Perf + branding + AT | Code-split maps; Zoogno green route; checklist below |

---

## 7. ETA / route refresh policy (no spam)

| Trigger | Action |
|---------|--------|
| Session start | Full Directions |
| Move ≥ 150m from route origin used for last calc | Refresh |
| Off-route > 40m from polyline | Immediate reroute |
| Every 60–90s while moving | ETA-only refresh (or lightweight Directions) |
| Speed ≈ 0 for > 20s | Slow location posts; skip route refresh |
| Approach dest < 300m | More frequent ETA |
| Delivered / cancelled | Stop all |

**Never** call Directions on every GPS tick.

---

## 8. Phased build order (implementation)

### Phase A — Foundation (blocker)
1. Dummy env + packages
2. `mapboxClient.js` + rewrite geocode/route
3. Reverse geocode endpoint
4. Shared geometry + bike marker + RouteLine
5. Cache key bump `route_v5`, `geocode:v3:mapbox`

### Phase B — Delivery navigation
1. Rewrite `DeliveryTrackingMap` → Mapbox heading-up
2. Adaptive location publisher
3. Off-route + reroute + route_version bump
4. Publish ETA + distance_remaining with location

### Phase C — Customer live tracking
1. Rewrite `CustomerTrackingMap`
2. Smooth marker + bearing filter
3. Consume ETA from socket/Firebase
4. Fix socket payload flatten (`location.lat` vs top-level)

### Phase D — Search / address / other panels ✅ (implemented)
1. `ZoneDrawMap` + Admin `ZoneManagement` (mapbox-gl-draw polygons)
2. `SellerCoverageMap` + Admin `SellerLocations` (markers + turf circles)
3. `SellerLocationMap` + Seller `LocationManagement` (zones + draggable pin + turf containment)
4. `mapsApi` + `mapPickerGeocodeFn` wired to Seller `Auth` MapPicker
5. Admin `EnvSettings` → Mapbox token fields

### Phase E — Cleanup
1. Remove Google packages + loader
2. Update EnvSettings / BillingCharges copy
3. Acceptance test checklist
4. Swap dummy tokens for real ones (your step)

### Phase F — Native (later, separate)
1. Android/iOS Mapbox Navigation SDK
2. Same `POST /delivery/location` contract
3. Optional: turn-by-turn voice UI only on native

---

## 9. Security rules

- Customer joins only `order:{ownOrderId}` (existing auth on socket)
- Delivery can POST location only when assigned / active workflow
- Admin fleet: existing admin auth only
- Frontend: `pk.` URL-restricted
- Backend: `sk.` server-only
- Rate-limit `/maps/*`
- On `DELIVERED`: stop publish; remove live Redis key; customer UI hides live map

---

## 10. Acceptance tests (must pass before prod)

- [ ] Live location updates correctly  
- [ ] Location accurate while moving  
- [ ] Bike marker moves smoothly (no jump)  
- [ ] Bike rotates with travel direction (shortest-angle)  
- [ ] Delivery map rotates heading-up  
- [ ] Manual drag pauses follow; Re-center restores  
- [ ] ETA is route-based (Mapbox duration), not distance/avgSpeed  
- [ ] ETA updates while moving  
- [ ] Off-route detection + auto-reroute  
- [ ] Customer gets realtime location for **own** order only  
- [ ] Tracking stops after DELIVERED  
- [ ] Background tab: best-effort web geolocation (document OS limits)  
- [ ] Battery: adaptive intervals  
- [ ] Weak GPS/network: degrade gracefully (last known + trail)  
- [ ] Low-end device: acceptable FPS  

---

## 11. What YOU (owner) provide later

1. Real Mapbox **public** token → `VITE_MAPBOX_ACCESS_TOKEN`
2. Real Mapbox **secret** token → `MAPBOX_ACCESS_TOKEN`
3. Optional: Zoogno custom style URL from Mapbox Studio → `VITE_MAPBOX_STYLE`
4. Production domain list for token URL restrictions

Until then, code uses **dummy** tokens; maps/API calls will fail until replaced (UI shows clear “configure Mapbox token” empty states).

---

## 12. Success definition

> Zoogno delivery tracking feels like a navigation system — not a map with a jumping GPS dot.

Maps + Navigation-parity + GPS + Road matching + Bearing + Heading-up + Zoogno realtime backend + WebSocket + Smooth marker + ETA engine + Off-route + Reroute — all working together on the existing Customer + Delivery web panels, with a clean path to native Navigation SDK later.
