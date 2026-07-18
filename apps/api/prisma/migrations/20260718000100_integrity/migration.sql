-- ============================================================================
-- Data integrity layer — Riya (Database & Data Integrity lane)
--
-- Everything here is enforced by the DATABASE, not by application code. A bug
-- in a service, a stray psql session, or a future developer's "quick fix" all
-- hit the same wall. This is the security story we present to the judges.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Geospatial indexes
--    Corridor matching runs ST_DWithin against every published ride in the
--    org. Without GiST that is a sequential scan over full LineStrings; with
--    it, the bounding-box filter discards almost everything before any
--    expensive geometry maths runs.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS rides_route_geom_gist ON rides USING GIST (route_geom);
CREATE INDEX IF NOT EXISTS rides_origin_pt_gist  ON rides USING GIST (origin_pt);
CREATE INDEX IF NOT EXISTS rides_dest_pt_gist    ON rides USING GIST (dest_pt);
CREATE INDEX IF NOT EXISTS bookings_pickup_pt_gist ON bookings USING GIST (pickup_pt);
CREATE INDEX IF NOT EXISTS trip_locations_pt_gist  ON trip_locations USING GIST (pt);

-- Search always filters published rides by org and departure window; a partial
-- index keeps completed/cancelled history out of the hot path entirely.
CREATE INDEX IF NOT EXISTS rides_open_search_idx
    ON rides (org_id, departure_at)
    WHERE status = 'published' AND seats_available > 0;

-- ---------------------------------------------------------------------------
-- 2) Completed-trip immutability
--    Once a trip reaches a terminal state its record is history: it feeds
--    reports, the ledger, and CO2 numbers. Editing it silently corrupts all
--    three. Deletion is refused outright; updates are refused except for the
--    one legal forward move (completed -> payment_pending ->
--    payment_completed), so the payment flow can still finish.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_trip_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('completed', 'payment_pending', 'payment_completed') THEN
            RAISE EXCEPTION
                'Trip % is completed and cannot be deleted (status=%)', OLD.id, OLD.status
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- A fully settled trip is frozen. No exceptions.
    IF OLD.status = 'payment_completed' THEN
        RAISE EXCEPTION
            'Trip % is settled and immutable', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.status IN ('completed', 'payment_pending') THEN
        -- Only the status column may move, and only forward along the lifecycle.
        IF (NEW.ride_id, NEW.started_at, NEW.completed_at, NEW.created_at)
           IS DISTINCT FROM
           (OLD.ride_id, OLD.started_at, OLD.completed_at, OLD.created_at) THEN
            RAISE EXCEPTION
                'Trip % is completed; only status may change (attempted edit to trip data)', OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;

        IF NOT (
            (OLD.status = 'completed'       AND NEW.status = 'payment_pending') OR
            (OLD.status = 'payment_pending' AND NEW.status = 'payment_completed')
        ) THEN
            RAISE EXCEPTION
                'Illegal trip transition % -> % on completed trip %', OLD.status, NEW.status, OLD.id
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_immutability ON trips;
CREATE TRIGGER trg_trip_immutability
    BEFORE UPDATE OR DELETE ON trips
    FOR EACH ROW EXECUTE FUNCTION enforce_trip_immutability();

-- ---------------------------------------------------------------------------
-- 3) Append-only wallet ledger
--    Balance is SUM(amount). That identity only holds if rows never change
--    after they are written, so the database refuses to change them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_ledger_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'wallet_transactions is append-only; % is not permitted. Post a reversing entry instead.', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_append_only ON wallet_transactions;
CREATE TRIGGER trg_ledger_append_only
    BEFORE UPDATE OR DELETE ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION enforce_ledger_append_only();

-- GPS pings are evidence. Same rule.
CREATE OR REPLACE FUNCTION enforce_append_only_generic()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_locations_append_only ON trip_locations;
CREATE TRIGGER trg_trip_locations_append_only
    BEFORE UPDATE ON trip_locations
    FOR EACH ROW EXECUTE FUNCTION enforce_append_only_generic();

-- ---------------------------------------------------------------------------
-- 4) Cross-organization containment
--    org_id is the trust boundary. A driver must never publish a ride on
--    another org's vehicle, and a passenger must never book across orgs —
--    that would leak one company's commute patterns to another.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_ride_org_consistency()
RETURNS TRIGGER AS $$
DECLARE
    driver_org  UUID;
    vehicle_org UUID;
    veh_status  TEXT;
BEGIN
    SELECT org_id INTO driver_org FROM users WHERE id = NEW.driver_id;
    SELECT org_id, status::TEXT INTO vehicle_org, veh_status FROM vehicles WHERE id = NEW.vehicle_id;

    IF driver_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'Driver % does not belong to organization %', NEW.driver_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF vehicle_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'Vehicle % does not belong to organization %', NEW.vehicle_id, NEW.org_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Admin approval gate from the mockup's Vehicles tab.
    IF veh_status <> 'approved' THEN
        RAISE EXCEPTION 'Vehicle % is not approved for ride sharing (status=%)', NEW.vehicle_id, veh_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ride_org_consistency ON rides;
CREATE TRIGGER trg_ride_org_consistency
    BEFORE INSERT OR UPDATE OF driver_id, vehicle_id, org_id ON rides
    FOR EACH ROW EXECUTE FUNCTION enforce_ride_org_consistency();

CREATE OR REPLACE FUNCTION enforce_booking_rules()
RETURNS TRIGGER AS $$
DECLARE
    passenger_org UUID;
    ride_org      UUID;
    ride_driver   UUID;
BEGIN
    SELECT org_id INTO passenger_org FROM users WHERE id = NEW.passenger_id;
    SELECT org_id, driver_id INTO ride_org, ride_driver FROM rides WHERE id = NEW.ride_id;

    IF passenger_org IS DISTINCT FROM ride_org THEN
        RAISE EXCEPTION 'Passenger % cannot book a ride from another organization', NEW.passenger_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.passenger_id = ride_driver THEN
        RAISE EXCEPTION 'A driver cannot book a seat on their own ride'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_rules ON bookings;
CREATE TRIGGER trg_booking_rules
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION enforce_booking_rules();

-- ---------------------------------------------------------------------------
-- 5) Seat-count sanity
--    The booking transaction decrements seats under SELECT ... FOR UPDATE, so
--    this should never fire. It exists precisely so that if the locking is
--    ever wrong, the failure is a loud constraint violation instead of a
--    quietly oversold car.
-- ---------------------------------------------------------------------------
ALTER TABLE rides
    ADD CONSTRAINT chk_seats_available_range
    CHECK (seats_available >= 0 AND seats_available <= seats_total);

ALTER TABLE rides
    ADD CONSTRAINT chk_seats_total_positive
    CHECK (seats_total > 0);

ALTER TABLE bookings
    ADD CONSTRAINT chk_booking_seats_positive
    CHECK (seats > 0);

ALTER TABLE wallet_transactions
    ADD CONSTRAINT chk_ledger_amount_nonzero
    CHECK (amount <> 0);
