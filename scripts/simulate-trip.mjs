#!/usr/bin/env node
/**
 * Location simulator — Dhrumi (demo tooling)
 *
 * Replays a vehicle along a ride's real OSRM route, emitting location:update
 * over the same socket a driver's phone uses. The server cannot tell the
 * difference, so tracking, ETA and deviation detection all exercise their
 * real code paths.
 *
 * This is not a shortcut around the GPS feature — it is insurance. Venue wifi
 * and indoor GPS fail routinely, and a demo that depends on a working satellite
 * fix in a basement conference hall is a demo that dies on stage.
 *
 * Usage:
 *   node scripts/simulate-trip.mjs --email raj.patel@odoo.com --trip <tripId>
 *   node scripts/simulate-trip.mjs --trip <id> --speed 8 --deviate
 *
 *   --speed N    playback multiplier (default 6 = 6x real time)
 *   --interval N seconds between pings (default 2)
 *   --deviate    veer off-corridor at the halfway point to fire the safety alert
 */
import { io } from 'socket.io-client';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const API = arg('api', process.env.API_URL ?? 'http://localhost:4000');
const EMAIL = arg('email', 'raj.patel@odoo.com');
const PASSWORD = arg('password', 'demo1234');
const TRIP_ID = arg('trip', null);
const SPEED = Number(arg('speed', '6'));
const INTERVAL_S = Number(arg('interval', '2'));
const DEVIATE = flag('deviate');

if (!TRIP_ID) {
  console.error('Missing --trip <tripId>.  Find one with GET /trips/mine');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. Sign in as the driver — only the driver may post location.
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error('Login failed:', (await loginRes.json().catch(() => ({}))).error?.message);
    process.exit(1);
  }
  const { accessToken, user } = await loginRes.json();
  console.log(`Signed in as ${user.name}`);

  // 2. Find the ride behind this trip and pull its stored route geometry.
  const trips = await (
    await fetch(`${API}/trips/mine`, { headers: { Authorization: `Bearer ${accessToken}` } })
  ).json();

  const trip = trips.find((t) => t.tripId === TRIP_ID);
  if (!trip) {
    console.error(`Trip ${TRIP_ID} not found among your trips.`);
    console.error('Your trips:', trips.map((t) => `${t.tripId} (${t.originLabel} -> ${t.destLabel})`).join('\n  '));
    process.exit(1);
  }

  const routeRes = await fetch(`${API}/rides/${trip.rideId}/route`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!routeRes.ok) {
    console.error('Could not load the route geometry for that ride.');
    process.exit(1);
  }
  const route = await routeRes.json();
  const coords = route.coordinates; // [lng, lat][]
  console.log(`Route: ${trip.originLabel} -> ${trip.destLabel} (${coords.length} points)`);

  // 3. Connect over the same socket the app uses.
  const socket = io(API, { auth: { token: accessToken } });

  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', (e) => reject(new Error(e.message)));
  });
  console.log('Socket connected');

  await new Promise((resolve, reject) => {
    socket.emit('trip:join', { tripId: TRIP_ID }, (r) =>
      r?.ok ? resolve() : reject(new Error(r?.error ?? 'join failed')),
    );
  });
  console.log(`Joined trip room. Replaying at ${SPEED}x, ping every ${INTERVAL_S}s.`);

  socket.on('safety:alert', (a) => {
    console.log(`\n  *** SAFETY ALERT (${a.kind}): ${a.detail}\n`);
  });

  // 4. Walk the polyline. Step size scales with playback speed, so a faster
  //    replay skips points rather than sending them faster than the server
  //    would ever see them.
  const step = Math.max(1, Math.round((coords.length / 120) * SPEED));
  const deviateAt = Math.floor(coords.length / 2);

  for (let i = 0; i < coords.length; i += step) {
    let [lng, lat] = coords[i];

    // Push the vehicle ~1.2 km sideways past the midpoint. Three consecutive
    // pings past the 500 m threshold is what trips the alert.
    if (DEVIATE && i >= deviateAt) {
      const drift = Math.min((i - deviateAt) / step, 6) * 0.002; // ~200 m per step
      lat += drift;
      lng += drift;
    }

    await new Promise((resolve) => {
      socket.emit(
        'location:update',
        { tripId: TRIP_ID, lat, lng, speed: 30 + Math.random() * 15 },
        () => resolve(),
      );
    });

    const pct = Math.round((i / coords.length) * 100);
    process.stdout.write(`\r  ${String(pct).padStart(3)}%  ${lat.toFixed(5)}, ${lng.toFixed(5)}${DEVIATE && i >= deviateAt ? '  [deviating]' : '          '}`);

    await sleep(INTERVAL_S * 1000);
  }

  // Final ping exactly on the destination so the ETA lands at zero.
  const [endLng, endLat] = coords[coords.length - 1];
  socket.emit('location:update', { tripId: TRIP_ID, lat: endLat, lng: endLng, speed: 0 });

  console.log('\nArrived. Driver can now complete the trip.');
  await sleep(500);
  socket.close();
}

main().catch((e) => {
  console.error('\nSimulator failed:', e.message);
  process.exit(1);
});
