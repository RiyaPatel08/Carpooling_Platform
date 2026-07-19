# TASK.md — Enterprise Carpooling Platform (24h)

> Live task tracker. Update as you go; add discoveries under "Discovered mid-process."
> Rule from mentor: ONE owner per lane. Every member commits their own lane's work from
> their own account (Odoo checks Git activity; mentor review at ~17:00–17:30 is INDIVIDUAL —
> each person explains their own lane).

**Ownership lanes (LOCKED):**
- **[R] RIYA — Database & Data Integrity:** Prisma schema, PostGIS migrations, GiST indexes,
  immutability trigger, seed data, ERD, DB invariants
- **[T] TANVISH — Backend Services & Realtime:** auth, org middleware, rides/booking/fare,
  trip state machine, Socket.IO, wallet/payments logic, corridor matching, deviation alert
- **[K] KUSH — Mobile App (Expo):** every mobile screen, map integration, mockup fidelity
- **[D] DHRUMI — API Contract, Admin Web & Reports:** shared Zod package, frozen REST
  contract, Postman collection, validation sweep, admin dashboard (web), reports APIs +
  charts, location simulator CLI, README + demo assets

**Demo-story decision (team-aligned, LOCKED):** the judged demo follows PLANNING.md §12 —
corridor matching → live tracking → deviation safety alert → wallet ledger → payment
success/failure → admin reports. This is the flow the PS lifecycle and the Excalidraw
screens actually support (the mockup has NO waitlist / preferred-driver screens).
**Ride cancellation IS built** (PS bonus feature, cheap with our state machine) and gets one
demo beat. Waitlist + preferred-driver + admin-backup ladder from the concept guide =
**one pitch slide ("roadmap"), zero code.** No further debate on this.

---

## Milestone 0 — Setup (H0–H2) — ALL HANDS
- [ ] Create GitHub repo; PR-to-main flow; each member makes ≥1 commit from own account in H1
      (even docs/scaffold) so activity exists from hour one
- [ ] pnpm monorepo scaffold: `apps/api`, `apps/mobile` (Expo), `apps/admin` (Vite), `packages/shared`
- [ ] docker-compose: `postgis/postgis:16` up; `.env` conventions
- [ ] **START OSRM NOW (background):** Geofabrik western-zone extract → (optional) osmium clip
      to Ahmedabad–Gandhinagar bbox → osrm-extract/partition/customize → osrm-routed :5000 →
      verify `/route/v1/driving/72.55,23.02;72.63,23.19`
- [ ] [R] Prisma init + FULL schema migration (all tables from PLANNING.md §5, incl. PostGIS
      columns via raw SQL migration + GiST index)
- [ ] [D] Shared Zod schemas package skeleton; [T] Express skeleton with error handler + request logging
- [ ] [D] Postman workspace created, shared with team
- [ ] [K] Expo app boots; MapLibre RN spike renders OSM tiles on device (**GO/NO-GO by H2** →
      fallback react-native-maps + UrlTile — fallback runs in Expo Go, take it fast if dev-build fights)

## Milestone 1 — Core Domain (H2–H6) — target: show at 17:00 mid-eval
- [ ] [T] Auth: register/login/refresh, argon2, JWT middleware, org-scope middleware
- [ ] [R] Seed script: 1 org (fuel ₹96/L, mileage 18 kmpl), 1 admin, 4 employees, 2 vehicles, demo rides
- [ ] [R] Completed-trip immutability TRIGGER; [T] service-layer state machine guards
- [ ] [T] `GET /geo/route` OSRM proxy: route, distance, duration, polyline → decode → store LineString
- [ ] [T] `POST /rides` publish: vehicle-approved check, route fetch+store, fare suggestion from org config
- [ ] [T] Baseline `GET /rides/search`: org + time-window (±2h) + seats filters, sorted
- [ ] [T] `POST /rides/:id/book` with `SELECT ... FOR UPDATE` seat decrement (write the race-condition test)
- [ ] [T] Vehicles CRUD API (employee self-register; admin approve path for [D])
- [ ] [K] Screens: Splash, Login, Signup(+photo), Dashboard shell + nav (mockup fidelity)
- [ ] [K] Find Ride form (Photon autocomplete, swap button, date/time, seats, recurring toggle)
- [ ] [K] **Offer Ride form** (start/dest + swap, date/time, seats, fare-per-seat prefilled from
      suggestion, Publish button) — twin of Find Ride, share components
- [ ] [D] Admin web shell: login, Employees tab CRUD, Vehicles approve/inactive, Settings (fuel cost)
- [ ] [D] Postman collection covers all M1 endpoints (mentor: test before FE integration)
- [ ] **17:00 review artifacts:** [R] ERD/schema diagram, [D] Postman walkthrough
      (register→vehicle→publish→search→book), [T] state-machine sketch, [K] screens on device

## Milestone 2 — Trips, Realtime, Payments (H6–H14)
- [ ] [T] Trip lifecycle endpoints: start/complete; status transitions enforced; My Trips API
- [ ] [T] **Booking cancellation:** `POST /bookings/:id/cancel` — seat release in same
      transaction, block after trip start, `trip:status` socket notify to driver
- [ ] [T] Socket.IO: trip rooms, `location:update`→persist+rebroadcast, `chat:message`→persist
- [ ] [D] **Location simulator CLI** (replay along OSRM polyline, configurable speed + deviation flag)
- [ ] [K] **My Vehicle screen** (vehicle list, Add Vehicle form: model, reg no, seats; manage/edit)
      — required before Offer Ride works end-to-end
- [ ] [K] Route Confirmation screen (polyline on map; shared by Find + Offer flows) +
      Available Rides cards (driver, fare, seats, Book Now)
- [ ] [K] My Trips + Trip Details (driver, vehicle, pickup/drop, Chat, Call `tel:` link,
      **Cancel booking button** with confirm dialog)
- [ ] [K] Track Ride screen: live marker (turf interpolation), ETA, route line
- [ ] [T] Wallet: ledger ops, balance endpoint, Razorpay test-mode recharge — prefer
      client-callback + server signature verify (webhook via ngrok = stretch), idempotency key,
      **success AND failure paths**
- [ ] [T] Trip payment: wallet transfer (atomic debit+credit), cash confirm, card/UPI via Razorpay test
- [ ] [K] Trip Finish + Payment screen (Cash/Card/UPI/Wallet, Pay ₹X) + Wallet screen (balance, recharge)
- [ ] [K] **Ride History screen** (completed trips: participants, route, vehicle, date/time, status)
- [ ] [T] Ride History API; profile edit API (self-only RBAC verified)

## Milestone 3 — Differentiators (H14–H19)
- [ ] [T] **Corridor matching:** ST_DWithin gross match + ST_LineLocatePoint direction check +
      OSRM via-waypoint detour + score ranking; "+X min detour" in search results (both UIs)
- [ ] [T] **Route-deviation safety alert:** ST_Distance per ping (>500 m × 3 pings) →
      `safety:alert` + `safety_events` row + SOS button (passenger); [D] admin feed
- [ ] [D] Reports APIs + admin charts: trips, distance, fuel cost, cost/km, vehicle-wise,
      utilization, monthly summary, **CO₂ saved**
- [ ] [K] Reports screen (mobile) + Settings screen (Saved Places, Help, quick links)
- [ ] [T] Saved Places CRUD; [K] wired into Find/Offer forms
- [ ] [D] Validation sweep: every endpoint Zod-guarded; friendly error messages (rubric:
      invalid email → proper feedback); [K] RN form errors rendered

## Milestone 4 — Polish, Stretch, Rehearse (H19–H24)
- [ ] [R] Seed realistic demo data (ISKCON→Infocity corridor, ₹120 fares, names from mockup)
- [ ] [K][D] UI consistency pass: one color scheme, spacing, empty states, loading states (rubric)
- [ ] ALL Bug triage; kill flaky features rather than demo them
- [ ] **Demo rehearsal ×2** with simulator (script in PLANNING.md §12); each member presents
      their own lane (Odoo requirement + individual review prep)
- [ ] [D] README: architecture diagram, [R] ERD, setup steps, decision log (reviewers read repos)
- [ ] STRETCH [D]: Slack slash-command `/ride status` via ngrok (ONLY if core is demo-complete)
- [ ] STRETCH [T]: WebRTC call (simple-peer over existing socket); keep `tel:` fallback
- [ ] STRETCH [T]: recurring-ride instance generation (naive loop from rule)

---

## Backlog (only if miraculously ahead)
- [ ] Wallet refund on cancellation (extends the cancel flow we now ship)
- [ ] Waitlist when ride full (currently: pitch slide only)
- [ ] Preferred/priority driver sort (currently: pitch slide only)
- [ ] In-app notifications feed (poll-based; no push infra)
- [ ] Admin: employee participation stats per PS admin responsibilities
- [ ] Photon self-host (kill last external dependency)
- [ ] Driver max-detour preference field in Offer Ride

## Cut order (if drowning)
1. WebRTC call → `tel:` link only
2. Slack integration → pitch slide only
3. Recurring rides → store rule, don't generate
4. Reports → 3 charts instead of 6
5. Cancellation UI polish → API + basic button only
**Never cut:** corridor matching, live tracking, wallet ledger, payment success/failure,
admin, safety alert, the three mockup screens (Offer Ride / My Vehicle / Ride History).

## Git workflow (how "all 4 commit" actually happens)
- Branch per lane: `riya/db`, `tanvish/backend`, `kush/mobile`, `dhrumi/api-admin`.
- Work may be generated centrally, but **each member pulls their lane branch on their own
  machine (or GitHub web editor for docs), reviews it, commits, pushes, and opens/merges
  their own PRs from their own account.** 2 minutes per handoff.
- Reason: mentor review is individual — you must be able to explain what's in "your" commits.
  Reviewing before pushing is what makes that possible.
- Pairing on someone's lane → add `Co-authored-by:` trailer, honest and GitHub-visible.
- Commit early, commit small; ≥1 commit per member in H1.

## Discovered mid-process
- [x] **Cross-navigator navigation was silently dead.** Tab routes (Dashboard,
      MyTrips, MyVehicle, Wallet, Settings) live inside the `Main` stack screen.
      React Navigation resolves a route name UPWARD through parents only, never
      downward into a child, so `navigate('MyTrips')` from any stack screen
      matched nothing and was dropped without an error. This is why "View Trip",
      "Go to My Vehicle", "Add money", "View My Trips" and publish-a-ride all
      appeared to do nothing. Fixed by splitting `MainTabParamList` from
      `RootStackParamList` (so TypeScript now catches it) plus a `goToTab()`
      helper. Affected: RouteConfirmation, TripDetails, AvailableRides,
      OfferRide, Payment.
- [x] **Sub-segment bookings were billed the full-route fare.** `bookingFare()`
      ignored pickup/drop entirely. Now prices by the share of the driver's
      route actually ridden, via `ST_LineLocatePoint` (the same function
      corridor matching already used), with a 25% minimum-fare floor. Search
      results show `yourFarePerSeat` so the quote matches the charge.
- [x] **`socket.off(event)` with no handler** in Chat and TrackRide removed
      EVERY listener for that event, including other screens' and the
      notification provider's. Now removes only its own handler.
- [x] **Cancelled trip showed an endless spinner.** TripDetails treated
      `trip === null` as both "loading" and "not found", and cancelling removes
      the ride from `/trips/mine`. Now a three-state load with a real
      "no longer active" screen.
- [x] **`photoUrl` was validated as `.url()`**, which rejects our own
      `/uploads/...` paths — the profile photo could never save.
- [ ] Wallet refund on cancellation is still not implemented (backlog).

## Notes from mentor meeting #1
- No Firebase (rubric overrides mentor's passing suggestion) — Postgres + WebSocket
- Payment: demo success + failure; don't over-engineer to enterprise level
- Security is a top evaluation axis: RBAC, self-only mutations, completed-ride immutability
- Show all rides is acceptable baseline; matching is add-on (we layer corridor on top)
- Live location is the USP; open-source maps approved
- API-first, Postman-tested before frontend integration
- Full ownership per member; don't double up on one API
- Mid-eval ~17:00–17:30 (confirm exact time) — bring schema/ERD, Postman flow, state machine,
  screens; review is INDIVIDUAL per member
