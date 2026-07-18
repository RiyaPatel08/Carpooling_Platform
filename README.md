# SyncRoute — Enterprise Carpooling Platform

> Odoo x KSV Hackathon 2026 · Carpooling Platform problem statement · **Team ID-49**

Employees of a registered organization discover, offer, book, track and pay for shared
rides. Administrators get cost visibility, safety oversight and ESG reporting.

---

## What makes this different

Three things, and each is a specific engineering decision rather than a feature bullet:

**1. Corridor matching, not endpoint matching.**
Most implementations match a passenger to a ride when the two share a start and an end.
We store the driver's *actual road route* as a PostGIS `geography(LineString)` and match
against the line itself:

1. `ST_DWithin(route_geom, pickup, 1500)` **and** the same for drop — both ends near the
   road the driver really drives. GiST-indexed, so this is a bounding-box filter first.
2. `ST_LineLocatePoint(route, pickup) < ST_LineLocatePoint(route, drop)` — pickup must come
   *before* drop along the route. This rejects the driver heading the opposite way down the
   same road, which pure proximity matching gets wrong.
3. For the top candidates, re-route via the passenger's pickup and drop through OSRM and
   measure the real added minutes.

The result is the **"+4 min detour"** badge in both UIs. A passenger standing halfway along
someone's commute gets matched; endpoint matching returns nothing for them.

**2. Integrity enforced by the database, not by hope.**
Completed trips reject `UPDATE`/`DELETE` at the trigger level. The wallet is an append-only
double-entry ledger with **no balance column** — balance is `SUM(amount)`, an identity that
cannot drift because the rows cannot change. Rides and bookings cannot cross an organization
boundary. Seat counts are `CHECK`-constrained so a broken lock fails loudly instead of
quietly overselling a car.

**3. Live tracking that survives a bad venue.**
The driver's phone is the only source of position; everyone renders from the *server's*
rebroadcast, so no two devices disagree. Off-route distance and remaining distance come from
one PostGIS round trip, so the ETA agrees with the line the map is drawing. Three consecutive
pings more than 500 m off-corridor raise a safety alert to the passenger and the admin feed —
detection is server-side, so a tampered client cannot suppress its own alert.

---

## Stack

| Layer | Choice |
|---|---|
| Mobile | React Native (Expo 52), react-native-maps, expo-location |
| Admin web | React + Vite, Recharts |
| API | Node 20, TypeScript, Express, Socket.IO |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ORM | Prisma (CRUD) + `$queryRaw` (geospatial) |
| Validation | Zod, shared package imported by all three apps |
| Routing | OSRM — public instance by default, self-hostable via one env var |
| Geocoding | Photon (proxied through the API) |
| Payments | Wallet ledger; Razorpay **test mode** for recharge |

---

## Running it

```bash
pnpm install

# 1. Database
docker compose up -d db

# 2. Environment
cp .env.example .env
cp .env.example apps/api/.env

# 3. Schema + demo data
pnpm --filter @syncroute/api migrate
pnpm --filter @syncroute/api seed

# 4. Run
pnpm api        # http://localhost:4000
pnpm admin      # http://localhost:5173
pnpm mobile     # Expo — scan the QR code
```

For a physical phone, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (not `localhost`,
which on the phone means the phone).

### Demo accounts

Password for all: `demo1234`

| Email | Role |
|---|---|
| `admin@odoo.com` | Admin — Employees / Vehicles / Settings |
| `raj.patel@odoo.com` | Driver — Swift Dzire, publishes the demo ride |
| `krishna.s@odoo.com` | Driver — Alto 800 |
| `priya.nair@odoo.com` | Passenger — ₹500 wallet, Innova awaiting approval |
| `meera.joshi@odoo.com` | Passenger — ₹500 wallet |
| `sameer.rana@odoo.com` | **Access revoked** — login is blocked, by design |
| `admin@infobridge.demo` | Admin of the *second* company |

The second organization publishes the *same* ISKCON → Infocity corridor 15 minutes later.
It must never appear in an Odoo employee's search — that is the isolation proof, live.

### Self-hosting OSRM (optional)

```bash
./scripts/osrm-prepare.sh          # downloads + preprocesses the Ahmedabad bbox
docker compose --profile osrm up -d osrm
# then set OSRM_URL=http://localhost:5000
```

Nothing else changes — the routing client sits behind one env var.

### Location simulator

```bash
node scripts/simulate-trip.mjs --trip <tripId> --speed 8
node scripts/simulate-trip.mjs --trip <tripId> --deviate   # fires the safety alert
```

Replays a real route over the same socket a driver's phone uses. Venue wifi and indoor GPS
fail routinely; the demo does not depend on a satellite fix in a basement.

---

## API

Full collection in `postman/SyncRoute.postman_collection.json`, including a
**negative-cases folder** — invalid email returns per-field messages, a revoked employee gets
403, an employee hitting an admin route gets 403, restarting a completed trip gets 409.

```
POST   /auth/register  /auth/login  /auth/refresh  /auth/logout
GET    /me                          PUT  /me
GET    /vehicles                    POST /vehicles     PUT/DELETE /vehicles/:id
POST   /rides                       GET  /rides/search    GET /rides/:id  /rides/:id/route
GET    /rides/fare-suggestion       POST /rides/:id/book
GET    /bookings/mine               POST /bookings/:id/cancel
GET    /trips/mine  /trips/history  POST /trips/:id/start  /trips/:id/complete
GET    /trips/:id/messages  /trips/:id/track
GET    /wallet                      POST /wallet/recharge/order  /wallet/recharge/verify
POST   /payments/:bookingId
GET    /saved-places                POST /saved-places  DELETE /saved-places/:id
GET    /reports/summary  /reports/vehicles  /reports/monthly
GET    /geo/route  /geo/autocomplete
ADMIN  GET/POST/PUT /admin/employees   PUT /admin/vehicles/:id/status
       GET/PUT /admin/settings         GET /admin/safety-events
WS     trip:join  location:update  location:broadcast  chat:message
       trip:status  safety:alert  safety:sos
```

---

## Data model

12 tables, `org_id` on every one of them.

`organizations` · `users` · `refresh_tokens` · `vehicles` · `saved_places` · `rides` ·
`bookings` · `trips` · `trip_locations` · `messages` · `wallet_transactions` · `payments` ·
`safety_events`

Geospatial columns (`rides.origin_pt`, `dest_pt`, `route_geom`, `bookings.pickup_pt`,
`drop_pt`, `trip_locations.pt`, `safety_events.pt`) are `geography(…, 4326)` with GiST
indexes. They are declared `Unsupported()` in the Prisma schema so migrations create them,
while reads and writes go through raw SQL — CRUD via Prisma, geospatial via SQL.

Trip lifecycle (PS §5.4), enforced in the service layer *and* by a trigger:

```
booked → started → in_progress → completed → payment_pending → payment_completed
```

## Security model

- `orgId` is read from the **signed JWT and nowhere else** — never from a request body or
  param. That single rule is what makes multi-tenancy hold.
- `requireAuth` re-reads `isActive` and `role` from the database each request, so an admin
  revoking access takes effect immediately rather than at token expiry. Revocation also
  kills live refresh tokens.
- Login returns one message for unknown-email and wrong-password, so the endpoint cannot be
  used to enumerate who works at the company.
- Refresh tokens are stored hashed and rotated on use — a stolen one works at most once.
- Admins cannot revoke or demote themselves.
- Live location is shared only with a trip's driver and its booked passengers, authorised
  per socket join.

## Concurrency

Booking is one transaction opening with `SELECT ... FOR UPDATE` on the ride row. Two
passengers racing for the last seat serialise: the second blocks, re-reads `0`, and is
refused. The naive version — read seats, then update — oversells the car, because both
transactions read "1 available" before either writes.

## Testing

```bash
pnpm --filter @syncroute/api test
```

13 unit tests cover the fare split (occupancy scaling, float drift, rejected inputs) and the
trip state machine (every illegal transition in the 6×6 matrix is asserted to fail).

---

## Team

| Member | Lane |
|---|---|
| **Riya** | Database & data integrity — schema, PostGIS, indexes, triggers, seed |
| **Tanvish** | Backend services & realtime — auth, rides, matching, trips, wallet, sockets |
| **Kush** | Mobile app — every screen, maps, live tracking |
| **Dhrumi** | API contract, admin web & reports — Zod package, Postman, dashboard, simulator |

Architecture decisions and their rationale are logged in [PLANNING.md](PLANNING.md);
the task breakdown is in [TASK.md](TASK.md).
