-- One active ride per driver, one active booking per passenger.
--
-- The service layer checks this first for a friendly message, but a partial
-- unique index is the database backstop: it is atomic under concurrent
-- requests (two rapid "Publish Ride" taps cannot both win a plain
-- SELECT-then-INSERT check), and it holds even if a future code path
-- bypasses the service layer.
CREATE UNIQUE INDEX IF NOT EXISTS chk_one_active_ride_per_driver
    ON rides (driver_id)
    WHERE status IN ('published', 'started');

CREATE UNIQUE INDEX IF NOT EXISTS chk_one_active_booking_per_passenger
    ON bookings (passenger_id)
    WHERE status = 'booked';
