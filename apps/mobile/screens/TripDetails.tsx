import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';
import { STATUS_LABEL, STATUS_TONE, type TripRow } from './MyTrips';
import { photoSrc } from './Profile';
import { goToTab, type ScreenProps } from '../lib/navigation';

/**
 * Trip hub: who, where, when, and every action legal in the current state.
 *
 * Load state is three-valued on purpose. Previously `trip === null` meant both
 * "still fetching" and "not in the list", so cancelling a booking — which
 * removes the ride from /trips/mine — left this screen spinning forever. That
 * was the "cancelled ride just shows a loading screen" bug.
 */
type Load =
  | { phase: 'loading' }
  | { phase: 'ready'; trip: TripRow }
  | { phase: 'gone' }
  | { phase: 'error'; message: string };

export default function TripDetails({ route, navigation }: ScreenProps<'TripDetails'>) {
  const { user } = useAuth();
  const [state, setState] = useState<Load>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<TripRow[]>('/trips/mine');
      const found = all.find((t) => t.rideId === route.params.rideId);
      setState(found ? { phase: 'ready', trip: found } : { phase: 'gone' });
    } catch (e) {
      setState({
        phase: 'error',
        message: e instanceof ApiError ? e.message : 'Could not load this trip',
      });
    }
  }, [route.params.rideId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (state.phase === 'loading') return <Loading text="Loading trip…" />;

  if (state.phase === 'error') {
    return (
      <View style={s.centered}>
        <ErrorNote text={state.message} />
        <Button title="Try again" onPress={() => { setState({ phase: 'loading' }); void load(); }} />
      </View>
    );
  }

  // Booking cancelled, or the driver pulled the ride: the row is gone from
  // /trips/mine and there is nothing left to act on. Say so and offer the way
  // out, rather than spinning against an endpoint that will never return it.
  if (state.phase === 'gone') {
    return (
      <View style={s.centered}>
        <View style={s.goneIcon}>
          <Ionicons name="close-circle-outline" size={44} color={colors.textMuted} />
        </View>
        <Text style={s.goneTitle}>This trip is no longer active</Text>
        <Text style={s.goneBody}>
          It was cancelled, or your booking on it was released. Any seats you held have been
          returned to the driver.
        </Text>
        <Button title="Back to My Trips" onPress={() => goToTab('MyTrips')} />
        <Button
          title="Find another ride"
          variant="secondary"
          onPress={() => navigation.navigate('FindRide')}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    );
  }

  const trip = state.trip;
  const isDriver = trip.role === 'driver';
  const myBooking = trip.bookings.find((b) => b.passenger.id === user?.id);
  const rideCancelled = trip.rideStatus === 'cancelled';

  const tripId = trip.tripId;
  const activeBookings = trip.bookings.filter((b) => b.status !== 'cancelled');
  const canCancel = !rideCancelled && !isDriver && myBooking?.status === 'booked' && trip.status === 'booked';
  const canCancelRide = !rideCancelled && isDriver && trip.rideStatus === 'published';
  const canStart = !rideCancelled && !!tripId && isDriver && trip.status === 'booked';
  const canComplete = !!tripId && isDriver && ['started', 'in_progress'].includes(trip.status);
  const canTrack = !!tripId && ['started', 'in_progress'].includes(trip.status);
  const canPay = !isDriver && ['completed', 'payment_pending'].includes(trip.status) && !!myBooking;

  async function act(fn: () => Promise<unknown>, failMsg: string) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert(failMsg, e instanceof ApiError ? e.message : 'Please try again');
    } finally {
      setBusy(false);
    }
  }

  function cancelBooking() {
    Alert.alert('Cancel booking?', 'Your seat will be released back to the driver.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/bookings/${myBooking!.id}/cancel`, { method: 'POST' });
            // Leave rather than reload: this ride has just dropped out of
            // /trips/mine, so staying would only render the "gone" state.
            goToTab('MyTrips');
          } catch (e) {
            Alert.alert(
              'Could not cancel',
              e instanceof ApiError ? e.message : 'Please try again',
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function cancelRide() {
    Alert.alert(
      'Cancel this ride?',
      activeBookings.length > 0
        ? 'Every booked passenger will be notified and released. You will not be paid for this ride.'
        : 'You will be able to publish a new ride once this one is cancelled.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel ride',
          style: 'destructive',
          onPress: () =>
            act(() => api(`/rides/${trip.rideId}/cancel`, { method: 'POST' }), 'Could not cancel'),
        },
      ],
    );
  }

  const phone = isDriver ? activeBookings[0]?.passenger.phone : trip.driver.phone;
  const counterpart = isDriver ? activeBookings[0]?.passenger : trip.driver;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Trip Details</Text>
        <Badge
          text={rideCancelled ? 'Cancelled' : STATUS_LABEL[trip.status] ?? trip.status}
          tone={rideCancelled ? 'red' : STATUS_TONE[trip.status] ?? 'grey'}
        />
      </View>

      {rideCancelled && (
        <View style={s.banner}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={s.bannerText}>
            The driver cancelled this ride. Your seats have been released and you have not been
            charged.
          </Text>
        </View>
      )}

      {/* Route as a timeline: origin and destination read as a journey, not
          as two unrelated fields. */}
      <Card>
        <View style={s.leg}>
          <View style={s.dotFrom} />
          <Text style={s.legText}>{trip.originLabel}</Text>
        </View>
        <View style={s.legLine} />
        <View style={s.leg}>
          <View style={s.dotTo} />
          <Text style={s.legText}>{trip.destLabel}</Text>
        </View>
        <Text style={s.meta}>
          {new Date(trip.departureAt).toLocaleString('en-IN', {
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
          })}
        </Text>
      </Card>

      <Card>
        <Text style={s.section}>{isDriver ? 'Your vehicle' : 'Driver'}</Text>
        {!isDriver && (
          <View style={s.person}>
            <Avatar uri={photoSrc(trip.driver.photoUrl)} name={trip.driver.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={s.personName}>{trip.driver.name}</Text>
              <Text style={s.meta}>{trip.vehicle.model} · {trip.vehicle.registrationNo}</Text>
            </View>
          </View>
        )}
        {isDriver && (
          <>
            <Row label="Vehicle" value={trip.vehicle.model} />
            <Row label="Registration" value={trip.vehicle.registrationNo} />
          </>
        )}
      </Card>

      {isDriver ? (
        <Card>
          <Text style={s.section}>Passengers ({activeBookings.length})</Text>
          {activeBookings.length === 0 ? (
            <Empty text="Nobody has booked yet. Your ride is visible to colleagues in search." />
          ) : (
            activeBookings.map((b) => (
              <View key={b.id} style={s.passenger}>
                <Avatar uri={photoSrc(b.passenger.photoUrl)} name={b.passenger.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.personName}>{b.passenger.name}</Text>
                  <Text style={s.meta}>{b.pickupLabel} → {b.dropLabel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.fare}>₹{b.fareTotal}</Text>
                  <Text style={s.meta}>{b.seats} seat{b.seats > 1 ? 's' : ''}</Text>
                </View>
              </View>
            ))
          )}
        </Card>
      ) : myBooking ? (
        <Card>
          <Text style={s.section}>Your journey</Text>
          <Row label="Pick up point" value={myBooking.pickupLabel} />
          <Row label="Drop point" value={myBooking.dropLabel} />
          <Row label="Seats" value={String(myBooking.seats)} />
          <Row label="Fare for your segment" value={`₹${myBooking.fareTotal}`} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {canTrack && (
          <Button
            title="Track Ride"
            icon="navigate"
            onPress={() =>
              navigation.navigate('TrackRide', { tripId: tripId!, rideId: trip.rideId, isDriver })
            }
          />
        )}
        {canStart && (
          <Button
            title="Start Trip"
            icon="play"
            onPress={() => act(() => api(`/trips/${tripId}/start`, { method: 'POST' }), 'Could not start')}
            loading={busy}
          />
        )}
        {canComplete && (
          <Button
            title="Complete Trip"
            icon="checkmark-done"
            onPress={() => act(() => api(`/trips/${tripId}/complete`, { method: 'POST' }), 'Could not complete')}
            loading={busy}
          />
        )}
        {canPay && (
          <Button
            title={`Pay ₹${myBooking!.fareTotal}`}
            icon="wallet"
            onPress={() =>
              navigation.navigate('Payment', {
                bookingId: myBooking!.id,
                amount: myBooking!.fareTotal,
              })
            }
          />
        )}

        {!!tripId && !rideCancelled && (
          <Button
            title="Chat"
            icon="chatbubble-ellipses"
            variant="secondary"
            onPress={() => navigation.navigate('Chat', { tripId })}
          />
        )}

        {/* tel: link rather than in-app calling — no telephony dependency,
            and it uses the dialer the user already trusts. */}
        {!!phone && !rideCancelled && (
          <Button
            title={isDriver ? `Call ${counterpart?.name ?? 'Passenger'}` : 'Call Driver'}
            icon="call"
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${phone}`)}
          />
        )}

        {canCancel && (
          <Button title="Cancel Booking" icon="close-circle" variant="danger" onPress={cancelBooking} loading={busy} />
        )}
        {canCancelRide && (
          <Button title="Cancel Ride" icon="close-circle" variant="danger" onPress={cancelRide} loading={busy} />
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  centered: {
    flex: 1, backgroundColor: colors.background, padding: spacing.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  goneIcon: { marginBottom: spacing.md },
  goneTitle: { fontSize: 19, fontWeight: '700', color: colors.text, textAlign: 'center' },
  goneBody: {
    fontSize: 14, color: colors.textMuted, textAlign: 'center',
    marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 20,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  banner: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: '#FCE9E8', padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  bannerText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 19 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legLine: { width: 2, height: 18, backgroundColor: colors.border, marginLeft: 4 },
  dotFrom: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  dotTo: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  legText: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  fare: { fontSize: 15, fontWeight: '700', color: colors.text },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personName: { fontSize: 15, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  passenger: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
