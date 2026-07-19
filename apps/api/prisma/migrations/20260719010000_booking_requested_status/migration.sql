-- Mid-trip join requests: a passenger can ask to join a ride that has
-- already started, as long as the driver has not yet passed their pickup
-- point. Unlike an instant booking on a 'published' ride, this needs the
-- driver's approval before it holds a seat — 'requested' is that
-- in-between state.
ALTER TYPE "BookingStatus" ADD VALUE 'requested';
