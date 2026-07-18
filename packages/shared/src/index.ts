// SyncRoute shared contract
// Owner: Dhrumi (API Contract lane)
//
// Single source of truth for request/response shapes. The API validates every
// boundary with these; the admin web and mobile app import the inferred types.
// If a shape changes here, both ends fail to compile — which is the point.

export * from './enums.js';
export * from './geo.js';
export * from './auth.js';
export * from './vehicles.js';
export * from './rides.js';
export * from './bookings.js';
export * from './trips.js';
export * from './wallet.js';
export * from './admin.js';
export * from './reports.js';
