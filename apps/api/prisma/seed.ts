/**
 * Demo seed — Riya (Database & Data Integrity lane)
 *
 * Names, vehicles, places and fares are lifted from the Excalidraw mockup so
 * the running app matches the screens the judges were shown.
 *
 * Two organizations exist for one reason: to prove isolation on stage. Priya
 * at Odoo and the InfoBridge staff share the same corridor and departure
 * times, and still never see each other's rides.
 *
 *   pnpm --filter @syncroute/api seed
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const OSRM = process.env.OSRM_URL ?? 'https://routing.openstreetmap.de/routed-car';
const DEMO_PASSWORD = 'demo1234';

/** Real coordinates on the Ahmedabad–Gandhinagar corridor. */
const PLACES = {
  iskcon: { label: 'ISKCON Temple, Ahmedabad', lat: 23.0301, lng: 72.5074 },
  infocity: { label: 'Infocity, Gandhinagar', lat: 23.1877, lng: 72.6369 },
  sgHighway: { label: 'SG Highway, Bodakdev', lat: 23.0395, lng: 72.5138 },
  gift: { label: 'GIFT City, Gandhinagar', lat: 23.1615, lng: 72.6844 },
  adalaj: { label: 'Adalaj Stepwell', lat: 23.1663, lng: 72.5807 },
  vastrapur: { label: 'Vastrapur Lake, Ahmedabad', lat: 23.0395, lng: 72.5290 },
} as const;

interface Leg {
  distanceM: number;
  durationS: number;
  coordinates: [number, number][];
}

async function route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Leg> {
  const url =
    `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OSRM returned ${res.status}`);
  const body = (await res.json()) as {
    code: string;
    routes: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (body.code !== 'Ok') throw new Error(`OSRM said ${body.code}`);
  const r = body.routes[0];
  return {
    distanceM: Math.round(r.distance),
    durationS: Math.round(r.duration),
    coordinates: r.geometry.coordinates,
  };
}

const pointWkt = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`;
const lineWkt = (c: [number, number][]) =>
  `SRID=4326;LINESTRING(${c.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`;

/** Departure at a given hour, offset by whole days from today. */
function at(hour: number, minute = 0, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Clearing existing data...');
  // Ordered by dependency. trip_locations and wallet_transactions have
  // append-only triggers on UPDATE/DELETE-of-row, but TRUNCATE bypasses row
  // triggers, which is exactly why reseeding uses it.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      safety_events, payments, wallet_transactions, messages, trip_locations,
      trips, bookings, rides, saved_places, vehicles, refresh_tokens, users, organizations
    RESTART IDENTITY CASCADE
  `);

  const passwordHash = await argon2.hash(DEMO_PASSWORD);

  // --- organizations ------------------------------------------------------
  // Values match the mockup's Admin > Settings tab.
  const odoo = await prisma.organization.create({
    data: {
      name: 'Odoo Pvt. Ltd.',
      code: 'ODOO',
      city: 'Gandhinagar',
      registeredAddress: 'Gandhinagar, Gujarat',
      industry: 'Software',
      adminContact: 'admin@odoo.com',
      emailDomain: 'odoo.com',
      fuelCostPerLitre: new Prisma.Decimal(96.5),
      defaultMileageKmpl: new Prisma.Decimal(18),
      costPerKm: new Prisma.Decimal(8.0),
    },
  });

  const infobridge = await prisma.organization.create({
    data: {
      name: 'InfoBridge Systems',
      code: 'INFOBRIDGE',
      city: 'Ahmedabad',
      registeredAddress: 'Ahmedabad, Gujarat',
      industry: 'IT Services',
      adminContact: 'admin@infobridge.demo',
      emailDomain: 'infobridge.demo',
      fuelCostPerLitre: new Prisma.Decimal(94.0),
      defaultMileageKmpl: new Prisma.Decimal(16),
      costPerKm: new Prisma.Decimal(7.5),
    },
  });

  // --- users --------------------------------------------------------------
  const mk = (
    orgId: string,
    name: string,
    email: string,
    phone: string,
    extra: Partial<{ role: 'admin' | 'employee'; department: string; manager: string; location: string; isActive: boolean }> = {},
  ) =>
    prisma.user.create({
      data: {
        orgId,
        name,
        email,
        phone,
        passwordHash,
        role: extra.role ?? 'employee',
        department: extra.department ?? null,
        manager: extra.manager ?? null,
        location: extra.location ?? null,
        isActive: extra.isActive ?? true,
      },
    });

  const admin = await mk(odoo.id, 'A. Shah', 'admin@odoo.com', '9876500001', {
    role: 'admin',
    department: 'Administration',
    location: 'Gandhinagar',
  });
  const raj = await mk(odoo.id, 'Raj Patel', 'raj.patel@odoo.com', '9876500002', {
    department: 'Engineering',
    manager: 'A. Shah',
    location: 'Ahmedabad',
  });
  const krishna = await mk(odoo.id, 'Krishna Singh', 'krishna.s@odoo.com', '9876500003', {
    department: 'Sales',
    manager: 'R. Mehta',
    location: 'Ahmedabad',
  });
  const priya = await mk(odoo.id, 'Priya Nair', 'priya.nair@odoo.com', '9876500004', {
    department: 'HR',
    manager: 'A. Shah',
    location: 'Gandhinagar',
  });
  const meera = await mk(odoo.id, 'Meera Joshi', 'meera.joshi@odoo.com', '9876500005', {
    department: 'Finance',
    manager: 'A. Shah',
    location: 'Ahmedabad',
  });
  // Revoked access, so the admin's Platform Access toggle has something real
  // to show and the login-blocked path is demonstrable.
  await mk(odoo.id, 'Sameer Rana', 'sameer.rana@odoo.com', '9876500006', {
    department: 'Support',
    manager: 'R. Mehta',
    location: 'Ahmedabad',
    isActive: false,
  });

  const ibAdmin = await mk(infobridge.id, 'N. Desai', 'admin@infobridge.demo', '9876600001', {
    role: 'admin',
    location: 'Ahmedabad',
  });
  const ibDriver = await mk(infobridge.id, 'Farhan Qureshi', 'farhan.q@infobridge.demo', '9876600002', {
    department: 'Engineering',
    location: 'Ahmedabad',
  });

  console.log(`Users: ${6} at Odoo, 2 at InfoBridge`);

  // --- vehicles -----------------------------------------------------------
  const swift = await prisma.vehicle.create({
    data: {
      orgId: odoo.id,
      ownerId: raj.id,
      model: 'Swift Dzire',
      registrationNo: 'GJ01AB1234',
      seatingCapacity: 4,
      mileageKmpl: new Prisma.Decimal(18),
      color: 'White',
      status: 'approved',
    },
  });

  const alto = await prisma.vehicle.create({
    data: {
      orgId: odoo.id,
      ownerId: krishna.id,
      model: 'Alto 800',
      registrationNo: 'GJ01AB5034',
      seatingCapacity: 4,
      mileageKmpl: new Prisma.Decimal(22),
      color: 'Silver',
      status: 'approved',
    },
  });

  // Left pending on purpose: the admin approving this on stage is step 1 of
  // the demo script, and publishing with it must fail until they do.
  await prisma.vehicle.create({
    data: {
      orgId: odoo.id,
      ownerId: priya.id,
      model: 'Innova Crysta',
      registrationNo: 'GJ01CD7788',
      seatingCapacity: 7,
      mileageKmpl: new Prisma.Decimal(12),
      color: 'Grey',
      status: 'pending',
    },
  });

  const ibVehicle = await prisma.vehicle.create({
    data: {
      orgId: infobridge.id,
      ownerId: ibDriver.id,
      model: 'Hyundai i20',
      registrationNo: 'GJ05XY9090',
      seatingCapacity: 5,
      mileageKmpl: new Prisma.Decimal(17),
      color: 'Blue',
      status: 'approved',
    },
  });

  // --- saved places -------------------------------------------------------
  await prisma.savedPlace.createMany({
    data: [
      { userId: raj.id, label: 'Home', placeName: PLACES.iskcon.label, lat: new Prisma.Decimal(PLACES.iskcon.lat), lng: new Prisma.Decimal(PLACES.iskcon.lng) },
      { userId: raj.id, label: 'Office', placeName: PLACES.infocity.label, lat: new Prisma.Decimal(PLACES.infocity.lat), lng: new Prisma.Decimal(PLACES.infocity.lng) },
      { userId: priya.id, label: 'Home', placeName: PLACES.vastrapur.label, lat: new Prisma.Decimal(PLACES.vastrapur.lat), lng: new Prisma.Decimal(PLACES.vastrapur.lng) },
      { userId: priya.id, label: 'Office', placeName: PLACES.gift.label, lat: new Prisma.Decimal(PLACES.gift.lat), lng: new Prisma.Decimal(PLACES.gift.lng) },
    ],
  });

  // --- rides --------------------------------------------------------------
  async function publishRide(opts: {
    orgId: string;
    driverId: string;
    vehicleId: string;
    from: { label: string; lat: number; lng: number };
    to: { label: string; lat: number; lng: number };
    departureAt: Date;
    seats: number;
    fare: number;
    recurrence?: string;
  }) {
    const leg = await route(opts.from, opts.to);
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO rides (
        id, org_id, driver_id, vehicle_id, origin_label, dest_label,
        origin_pt, dest_pt, route_geom, route_distance_m, route_duration_s,
        departure_at, seats_total, seats_available, fare_per_seat,
        recurrence_rule, status, created_at
      ) VALUES (
        gen_random_uuid()::text, ${opts.orgId}, ${opts.driverId}, ${opts.vehicleId},
        ${opts.from.label}, ${opts.to.label},
        ST_GeogFromText(${pointWkt(opts.from.lat, opts.from.lng)}),
        ST_GeogFromText(${pointWkt(opts.to.lat, opts.to.lng)}),
        ST_GeogFromText(${lineWkt(leg.coordinates)}),
        ${leg.distanceM}, ${leg.durationS},
        ${opts.departureAt}, ${opts.seats}, ${opts.seats},
        ${new Prisma.Decimal(opts.fare)}, ${opts.recurrence ?? null}, 'published', NOW()
      )
      RETURNING id
    `;
    const rideId = rows[0].id;
    await prisma.trip.create({ data: { rideId, status: 'booked' } });
    console.log(
      `  ride ${opts.from.label} -> ${opts.to.label} ` +
        `(${(leg.distanceM / 1000).toFixed(1)} km, ${Math.round(leg.durationS / 60)} min)`,
    );
    return rideId;
  }

  console.log('Publishing rides (fetching real routes from OSRM)...');

  // The demo ride. Fare 120 and the ISKCON -> Infocity corridor are straight
  // from the mockup's Available Rides card.
  const demoRide = await publishRide({
    orgId: odoo.id,
    driverId: raj.id,
    vehicleId: swift.id,
    from: PLACES.iskcon,
    to: PLACES.infocity,
    departureAt: at(19, 0),
    seats: 3,
    fare: 120,
    recurrence: 'MO,TU,WE,TH,FR',
  });

  // Krishna gets one active ride, same as every other driver: a driver may
  // only have one ride published or in progress at a time (see
  // chk_one_active_ride_per_driver), so a second publishRide() for the same
  // driver here would fail exactly like it would from the app.
  await publishRide({
    orgId: odoo.id,
    driverId: krishna.id,
    vehicleId: alto.id,
    from: PLACES.iskcon,
    to: PLACES.adalaj,
    departureAt: at(20, 0),
    seats: 2,
    fare: 90,
  });

  // Same corridor, same evening, different company. This ride must never
  // appear in an Odoo employee's search results.
  await publishRide({
    orgId: infobridge.id,
    driverId: ibDriver.id,
    vehicleId: ibVehicle.id,
    from: PLACES.iskcon,
    to: PLACES.infocity,
    departureAt: at(19, 15),
    seats: 3,
    fare: 100,
  });

  // --- wallet -------------------------------------------------------------
  // Passengers start funded so the wallet payment path works immediately.
  await prisma.walletTransaction.createMany({
    data: [
      { orgId: odoo.id, userId: priya.id, amount: new Prisma.Decimal(500), type: 'recharge', idempotencyKey: `seed-recharge-${priya.id}`, note: 'Opening demo balance' },
      { orgId: odoo.id, userId: meera.id, amount: new Prisma.Decimal(500), type: 'recharge', idempotencyKey: `seed-recharge-${meera.id}`, note: 'Opening demo balance' },
      { orgId: odoo.id, userId: krishna.id, amount: new Prisma.Decimal(250), type: 'recharge', idempotencyKey: `seed-recharge-${krishna.id}`, note: 'Opening demo balance' },
      // Raj is left at zero on purpose: it makes the "insufficient balance"
      // failure path demonstrable without editing anything first.
    ],
  });

  console.log(`
Seed complete.

  Organizations : Odoo Pvt. Ltd. (ODOO), InfoBridge Systems (INFOBRIDGE)
  Password      : ${DEMO_PASSWORD}   (every account)

  admin@odoo.com          admin      - Employees / Vehicles / Settings tabs
  raj.patel@odoo.com      driver     - Swift Dzire, publishes the demo ride
  krishna.s@odoo.com      driver     - Alto 800
  priya.nair@odoo.com     passenger  - wallet 500, Innova awaiting approval
  meera.joshi@odoo.com    passenger  - wallet 500
  sameer.rana@odoo.com    REVOKED    - login is blocked, by design
  admin@infobridge.demo   admin      - the other company
  farhan.q@infobridge.demo driver    - same corridor, must stay invisible to Odoo

  Demo ride id  : ${demoRide}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
