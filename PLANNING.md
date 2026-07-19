# PLANNING.md — Enterprise Carpooling Platform ("SyncRoute")

> Odoo x KSV Hackathon 2026 — Final Round (24h) — Carpooling Platform PS
> This file is the single source of truth for vision, architecture, and stack.
> Decisions here are LOCKED unless a blocker forces a revisit. Log changes at the bottom.

---

## 1. Vision

An **enterprise carpooling platform**: employees of a registered organization discover, offer,
book, track, and pay for shared rides — with an admin layer that gives the company cost
visibility, safety oversight, and ESG (CO₂) reporting.

**Positioning (pitch):** consumer carpooling died (Waze Carpool, Hop In); the survivors
(MoveInSync SyncPool, QuickRide Enterprise, BlaBlaCar Daily) all live in the corporate wedge,
because the organization solves carpooling's two killer problems for free: **trust** (verified
colleagues) and **density** (same destinations, same schedules). We build for that wedge.

**Three differentiators (USPs):**
1. **Live tracking done excellently** — real GPS from the driver phone (Expo), WebSocket
   broadcast, ETA from remaining route distance. (Mentor-confirmed USP.)
2. **Visible security** — org-scoped multi-tenancy, strict RBAC, completed-trip immutability
   enforced at the DATABASE level (trigger), ledger-based wallet. (Mentor-confirmed USP.)
3. **Corridor-aware matching + route-deviation safety alert** — match passengers to a
   *sub-segment of the driver's route* (the BlaBlaCar two-step algorithm), and alert the
   passenger + admin if the vehicle drifts off-corridor mid-trip. This is our
   "AI/intelligence that is genuinely usable" answer — no chatbots.

**Anti-goals (do NOT build):** consumer/public rides, surge pricing, driver KYC flows,
push-notification infra, real money movement, native iOS polish. Recurring rides = store the
rule + naive instance generation only.

---

## 2. Constraints (from rubric + mentor meeting)

- **Rubric (Odoo briefing video):** PostgreSQL/MySQL over Firebase/Supabase/Mongo BaaS;
  minimal third-party APIs; robust input validation; all members using Git; clean consistent
  UI; database design weighted highest; AI only if genuinely useful.
- **DECISION — NO FIREBASE.** Mentor floated it for live location; it contradicts the rubric
  and adds nothing. Live location = Socket.IO broadcast + Postgres persistence. Final.
- **Mentor directives:** multi-org model (admin can manage orgs; users see only their own org);
  chat over the same WebSocket; payment = wallet + demo success/failure cases only (Razorpay
  test mode optional for recharge); fare from mileage/fuel/distance split per seat; completed
  rides immutable; users can only touch their own profile/vehicles/rides; API-first, testable
  in Postman before frontend integration; one owner per functional lane.
- **Matching sequencing (mentor + our call):** "show all org rides" baseline FIRST (hour ~8),
  corridor matching layered on top after core is stable. Schema supports it from day one.
- **Multi-organization** is an explicit PS assumption → `org_id` everywhere from row one.
- Payments: **Razorpay TEST MODE only** (PS-permitted). Cash = state transition.
- Timebox: 24h, 4 people. Mid-eval ~17:00–17:30 (individual review per member).

**Team ownership (LOCKED — one owner per lane, per mentor):**

| Member | Lane | Owns |
|---|---|---|
| **Riya** | Database & Data Integrity | Prisma schema, PostGIS migrations, GiST indexes, immutability trigger, seed data, ERD, DB invariants |
| **Tanvish** | Backend Services & Realtime | Auth, org middleware, rides/booking/fare, cancellation, trip state machine, Socket.IO, wallet/payments, corridor matching, deviation alert |
| **Kush** | Mobile App (Expo) | All mobile screens, map integration, mockup fidelity |
| **Dhrumi** | API Contract, Admin Web & Reports | Shared Zod package, frozen REST contract, Postman, validation sweep, admin dashboard, reports APIs + charts, location simulator, README/demo assets |

Each member commits and PRs their own lane from their own account (Odoo checks Git;
mentor review is individual). See TASK.md "Git workflow."

---

## 3. Architecture

```
┌─────────────────┐   ┌──────────────────┐
│ Employee App    │   │ Admin Dashboard  │
│ React Native    │   │ React (Vite) Web │
│ (Expo)          │   │                  │
└───────┬─────────┘   └────────┬─────────┘
        │  REST (JSON) + Socket.IO (WS)
        ▼                      ▼
┌──────────────────────────────────────────┐
│ API Server — Node 20 + TypeScript        │
│ Express, layered:                        │
│   routes → services → repositories       │
│ Zod validation at boundary               │
│ Socket.IO (rooms per trip) same process  │
│ JWT auth middleware + org-scope middleware│
└───────┬──────────────────┬───────────────┘
        │                  │ HTTP
        ▼                  ▼
┌───────────────┐   ┌─────────────────────┐
│ PostgreSQL 16 │   │ OSRM (self-hosted)  │
│ + PostGIS 3   │   │ Docker, Gujarat OSM │
│ (Docker)      │   │ extract, port 5000  │
└───────────────┘   └─────────────────────┘

Stretch: Slack slash-command endpoint (ngrok) hitting the same REST API.
```

- **API-first:** REST contract frozen early; Postman collection maintained; frontend integrates
  against the contract. (Mentor directive; also our Slack-integration enabler.)
- **Single Node process** serves REST + WebSocket. Scaling story for the pitch: stateless API →
  horizontal scale behind LB; Socket.IO Redis adapter for multi-node WS (named, not built).

---

## 4. Tech Stack (LOCKED)

| Layer | Choice | Why |
|---|---|---|
| Employee app | React Native + **Expo**, TypeScript | Team experience; expo-location gives REAL GPS for tracking demo |
| Map (mobile) | **MapLibre React Native** (fallback: react-native-maps + OSM UrlTile) | Open-source, no API key, pro look |
| Admin dashboard | React + Vite + Tailwind + shadcn/ui + Recharts | Fast, clean, judges' desktop view |
| Backend | **Node 20 + TypeScript + Express** | Team's language; layered structure answers "modularity" |
| Validation | **Zod**, schemas in shared package (`packages/shared`) | One source of truth FE+BE; direct "robust validation" answer |
| ORM | **Prisma** + `$queryRaw` for PostGIS | Speed for CRUD; raw SQL where geo needs it (SQL we can show off) |
| Database | **PostgreSQL 16 + PostGIS** (`postgis/postgis` Docker image) | Rubric requirement + geospatial crown jewel |
| Routing engine | **OSRM self-hosted** (ghcr.io/project-osrm/osrm-backend), Geofabrik India→Western-Zone extract (clip to Ahmedabad–Gandhinagar bbox with osmium if slow) | Route geometry, duration, distance, multi-waypoint detour calc; kills the maps-API dependency. Fallback: routing.openstreetmap.de |
| Geocoding | **Photon** (photon.komoot.io) autocomplete | OSM-based, free, no key |
| Realtime | **Socket.IO** — rooms per trip (location pings + chat on same socket) | Mentor directive; simplest mature choice |
| Geometry utils | @mapbox/polyline (decode OSRM polyline6), @turf/turf (along, nearestPointOnLine) | Marker animation, deviation detection |
| Payments | Wallet (internal ledger) primary; **Razorpay test-mode Checkout** for recharge; demo success + failure paths | Mentor directive; PS-permitted sandbox |
| Voice call | `tel:` link (ship) → WebRTC simple-peer over Socket.IO signaling (stretch) | Fallback-first; no Twilio |
| Auth | JWT access+refresh, argon2 | Standard |
| Monorepo | pnpm workspaces: `apps/api`, `apps/mobile`, `apps/admin`, `packages/shared` | Shared Zod types |
| Testing | Postman collection (mentor directive) + Vitest on fare calc, matching, ledger | Visible rigor |

---

## 5. Database Design (highest-weighted criterion)

All tables carry `org_id` (except `organizations`). All queries org-scoped via middleware.

**Tables:**
- `organizations` — id, name, fuel_cost_per_litre, default_mileage_kmpl, cost_per_km, created_at
- `users` — id, org_id, role (`admin` | `employee`), name, email (unique per org), phone,
  password_hash, photo_url, is_active
- `vehicles` — id, org_id, owner_id → users, model, registration_no (unique), seating_capacity,
  mileage_kmpl, status (`pending` | `approved` | `inactive`)  ← admin approval per mockup
- `saved_places` — id, user_id, label, lat, lng
- `rides` (driver offers) — id, org_id, driver_id, vehicle_id, origin_label, origin_pt
  `geography(Point)`, dest_label, dest_pt, **route_geom `geography(LineString)`** (GiST index),
  route_distance_m, route_duration_s, departure_at, seats_total, seats_available,
  fare_per_seat, recurrence_rule (nullable, e.g. `MO,TU,WE,TH,FR`), status
  (`published` | `started` | `completed` | `cancelled`)
- `bookings` — id, org_id, ride_id, passenger_id, seats, pickup_pt, drop_pt, pickup_label,
  drop_label, fare_total, status (`booked` | `cancelled` | `completed`),
  UNIQUE(ride_id, passenger_id)
- `trips` (execution of a ride) — id, ride_id, status: **`booked → started → in_progress →
  completed → payment_pending → payment_completed`** (PS lifecycle; transitions enforced in
  service layer state machine), started_at, completed_at
- `trip_locations` — id, trip_id, pt `geography(Point)`, speed, recorded_at (append-only ping log)
- `messages` — id, trip_id, sender_id, body, created_at
- `wallet_transactions` — **append-only double-entry ledger**: id, org_id, user_id, amount
  (+credit/−debit), type (`recharge` | `trip_payment` | `trip_earning` | `refund`),
  trip_id nullable, idempotency_key UNIQUE, created_at. Balance = SUM(amount) per user.
  NO mutable balance column.
- `payments` — id, booking_id, method (`cash` | `card` | `upi` | `wallet`), amount,
  status (`pending` | `success` | `failed`), gateway_ref, created_at
- `safety_events` — id, trip_id, kind (`route_deviation` | `sos`), pt, created_at

**Judge-bait invariants (implement + mention in pitch):**
1. **Seat booking under concurrency:** booking = single transaction with
   `SELECT ... FOR UPDATE` on the ride row → decrement seats → insert booking. Demo: two
   passengers race for the last seat; exactly one wins.
2. **Completed-trip immutability (mentor said twice):** Postgres trigger raising an exception
   on UPDATE/DELETE of trips in terminal states + service-layer guard. DB-level enforcement.
3. **Ledger integrity:** trip payment writes passenger debit + driver credit atomically in one
   transaction; idempotency key blocks webhook double-processing.
4. **Org isolation:** every repository function takes org_id from the JWT, never from request
   body. Users mutate only rows they own (RBAC checks in services).

---

## 6. Matching Engine (baseline → crown jewel)

**Baseline (hour ~8, mentor-approved):** list org rides filtered by departure-time window
(±2h), seats ≥ requested, status published. Sort by departure proximity, then fare.

**Corridor matching (layered upgrade — BlaBlaCar's published two-step):**
1. **Gross match (PostGIS):**
   `ST_DWithin(route_geom, pickup_pt, 1500) AND ST_DWithin(route_geom, drop_pt, 1500)`
   — passenger's points within ~1.5 km of the driver's route line (GiST index).
2. **Direction check:** `ST_LineLocatePoint(route, pickup) < ST_LineLocatePoint(route, drop)`
   — pickup occurs BEFORE drop along the route (no backwards matches).
3. **Refine (OSRM):** for top-N candidates, request route origin→pickup→drop→destination;
   detour = new_duration − original_duration; filter by max-detour (default 10 min);
   rank by score = w1·detour + w2·|Δdeparture| + w3·fare. Show "+X min detour" in both UIs.

**Fare suggestion (ties admin config into ride flow, per mockup + mentor):**
`fare_total = (distance_km / vehicle.mileage_kmpl) × org.fuel_cost_per_litre`
`suggested_fare_per_seat = fare_total / (seats_total + 1)` (driver shares cost).
Prefilled and editable at publish time.

**Segment-proportional booking fare (mentor review #2).** A passenger matched to
a *sub-segment* must not pay the whole-route fare — that would make corridor
matching a worse deal than it is. At booking time:

```
fraction = ST_LineLocatePoint(route, drop) − ST_LineLocatePoint(route, pickup)
fare     = fare_per_seat × seats × clamp(fraction, MIN_FARE_FRACTION, 1)
```

`MIN_FARE_FRACTION = 0.25` is a deliberate floor, not a fudge: the driver still
detours, stops and rejoins for a 2 km hop, so strict distance-proportional
pricing would make short legs effectively free and push cost onto whoever rides
furthest. Every ride-share prices this as a minimum fare. Search results carry
`yourFarePerSeat` computed by the same function, so the quoted price and the
charged price cannot diverge.

---

## 7. Live Tracking, Chat, Safety

- Driver app: `expo-location` watchPosition → emit `location:update` every 2–3 s to trip room.
- Server: persist to `trip_locations`, rebroadcast to room; ETA = remaining distance along
  route polyline ÷ average speed (fallback: OSRM remaining-leg duration).
- Passenger app: animated marker (turf `along` interpolation between pings).
- **Demo simulator (first-class dev tool, not a hack):** script replays points along the real
  OSRM polyline for a scripted trip → stage-proof demo even if venue GPS/network fails.
- **In-app trip simulation (`POST /trips/:id/simulate`).** Driver-only. Replays
  the ride's stored OSRM polyline through `recordPing` — the same function real
  GPS calls — so ETA, remaining distance, deviation strikes and the
  `trip_locations` audit trail are all produced by the production path. The
  demo therefore never depends on venue GPS. `{ deviate: true }` drags the
  second half off-corridor to fire the safety alert on cue (demo beat 7).
- Chat: `chat:message` events on same socket, persisted to `messages`, history via REST.
- **Notifications (per-user socket rooms).** Trip rooms are joined only while a
  trip screen is open, so they cannot carry "someone booked your ride" — the
  driver is on the dashboard when that happens. Every socket joins a `user:<id>`
  room at connect time; `notify()` emits booking created/cancelled, trip
  started/completed, payment received, chat message and SOS. Rendered as an
  in-app banner. Still NOT push infra (anti-goal): live-only, nothing persisted,
  so an event fired while offline is missed.
- **Route deviation:** server checks each ping's `ST_Distance` to route_geom; > 500 m for 3
  consecutive pings → `safety:alert` to room + row in `safety_events` + admin dashboard flag.
  Passenger sees SOS button. (~30 lines; the intelligence USP.)

## 8. Payments & Wallet

- Wallet recharge: Razorpay test-mode Checkout → webhook/verify → ledger credit
  (idempotency key). **Demo BOTH success and failure** (mentor directive) — failure path shows
  clean error + no ledger write.
- Trip payment: wallet (ledger transfer), or card/UPI via Razorpay test, or cash (driver
  confirms). All paths end at `payment_completed` state.

## 9. Reports & Admin

- Admin (web): Employees tab (CRUD, access grant/revoke), Vehicles tab (approve/inactive),
  Settings (company details, fuel cost per litre, cost/km), safety-events feed.
- Reports (SQL aggregates + Recharts): total trips, total distance, fuel cost, cost/km,
  vehicle-wise cost, utilization %, monthly financial summary (per mockup),
  **CO₂ saved = Σ(passenger-km) × 0.12 kg/km** — the ESG number enterprises pay for.

## 10. API Surface (frozen contract — Postman collection mirrors this)

```
POST /auth/register  POST /auth/login  POST /auth/refresh
GET/PUT /me          GET/POST/PUT /vehicles        GET/POST/DELETE /saved-places
POST /rides          GET /rides/search?from&to&date&seats   GET /rides/:id
POST /rides/:id/book POST /bookings/:id/cancel
GET /trips/mine      POST /trips/:id/start|complete
GET /trips/:id/messages
POST /wallet/recharge/order  POST /wallet/recharge/verify  GET /wallet
POST /payments/:bookingId    GET /history
GET /reports/summary         GET /reports/vehicles
ADMIN: GET/POST/PUT /admin/employees  PUT /admin/vehicles/:id/status  PUT /admin/settings
GET /admin/safety-events
UTIL: GET /geo/route?from&to (OSRM proxy)  GET /geo/autocomplete?q (Photon proxy)
STRETCH: POST /integrations/slack/command
WS events: location:update, location:broadcast, chat:message, trip:status, safety:alert
```

## 11. Slack Integration (P2 stretch — "headless platform" pitch)

One slash-command endpoint (`/ride status`, `/ride find <from> to <to>`) → parses → calls the
same services → returns Slack-formatted text. Exposed via ngrok. Build ONLY after core demo
is complete end-to-end. Pitch line: "the platform is API-first — here it is inside Slack."

## 12. Demo Script (rehearse at hour ~20) — THE team-aligned story

**Decision:** this is the single demo narrative. It is the flow the PS lifecycle and the
Excalidraw screens support (the mockup contains no waitlist/preferred-driver screens).
Cancellation (PS bonus) gets one beat. The concept guide's waitlist → preferred-driver →
admin-backup ladder = one "roadmap" pitch slide, zero code.

Driver phone (Expo) + passenger phone/emulator + admin web, side by side.
1. Admin: add employee, approve vehicle, set fuel cost.
2. Driver adds vehicle in **My Vehicle**, publishes ISKCON → Infocity via **Offer Ride**
   (mockup's own corridor; real OSRM route on map).
3. Passenger searches mid-corridor pickup → match appears **with "+4 min detour"** (the moment
   endpoint-matching teams can't replicate).
4. Book (mention/show the concurrent last-seat race).
5. **Cancel beat:** second passenger books, then cancels — seat count restores live, driver
   gets notified (PS bonus feature, 20 seconds of demo).
6. Start trip → live tracking both screens, ETA ticking, chat message.
7. Deviation: simulator drifts off-route → safety alert fires; admin feed logs it.
8. Complete → Pay ₹120 from wallet → show the two ledger rows.
9. Show a FAILED payment handled cleanly.
10. **Ride History** screen + Admin: reports updated, CO₂ ticked.
    ≤ 7 minutes. Each member presents their own lane (Odoo requirement + individual review).

## 13. Risks

| Risk | Mitigation |
|---|---|
| OSRM preprocessing slow/fails | Start extract NOW in background; clip bbox with osmium; fallback routing.openstreetmap.de |
| RN map library friction | MapLibre RN spike in first 2h; fallback react-native-maps+UrlTile; last resort: passenger tracking view as web page |
| Venue GPS/network flaky | Location simulator is first-class; demo never depends on real GPS |
| Corridor matching overruns | Baseline listing ships first; corridor is additive SQL |
| Team blocked on one lane | Ownership lanes (TASK.md); API contract lets lanes proceed in parallel |
| Firebase temptation returns | This file. Decision is final. |

## Decision Log
- [T0] Backend: Express+TS (not NestJS — no team experience, 24h). LOCKED.
- [T0] DB: Postgres+PostGIS, no Firebase anywhere. LOCKED.
- [T0] Matching: baseline listing first, corridor upgrade after. LOCKED sequencing.
- [T0] Payment: wallet-first + Razorpay test recharge; success+failure demo paths. LOCKED.
- [T1] Lanes named: Riya=DB, Tanvish=backend, Kush=mobile, Dhrumi=API/admin/reports. LOCKED.
- [T1] Demo story = §12 (corridor + tracking + safety + ledger + cancel beat). Waitlist /
  preferred-driver / admin-backup = roadmap slide only. LOCKED — resolves guide-vs-plan split.
- [T1] Cancellation promoted from backlog to M2 (endpoint was already in frozen API contract;
  cheap with state machine; PS-listed bonus).
- [T1] Missing mockup screens added to Kush's lane: Offer Ride (M1), My Vehicle (M2),
  Ride History (M2). These are mandatory-feature UIs, never cut.
- [T1] Razorpay: client-callback + server signature verify primary; webhook/ngrok = stretch.
- [T2] **Booking fare is segment-proportional** (§6), with a 25% minimum-fare
  floor. Flat per-seat pricing contradicted the corridor-matching USP.
- [T2] **In-app notifications via per-user socket rooms, not push.** Push infra
  stays an anti-goal; foreground banners cover every demo event.
- [T2] **Trip simulation promoted to a first-class API endpoint** (§7), not just
  the CLI script — judges ask to see tracking on a handset.
- [T2] **Maintenance cost derived from `org.cost_per_km` minus fuel**, rather
  than adding a maintenance table. Gives the mockup's Revenue / Fuel /
  Maintenance / Net Profit summary with no migration.
- [T2] **Mobile charts are plain Views, not a chart library.** A grouped bar
  chart is rectangles with proportional heights; react-native-svg would be a
  native dep that breaks Expo Go for no gain.
- [T2] **Departure time is picked from filtered lists, never typed.** Past times
  are not offered, so "no past departures" is structural rather than validated
  after the fact. Also avoids a native date-picker dependency.
