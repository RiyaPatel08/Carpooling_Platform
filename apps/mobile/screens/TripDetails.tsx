import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, spacing } from '../theme';
import { STATUS_LABEL, STATUS_TONE, type TripRow } from './MyTrips';
import type { ScreenProps } from '../lib/navigation';

export default function TripDetails({ route, navigation }: ScreenProps<'TripDetails'>) {
  const { user } = useAuth();
  const [trip, setTrip] = useState<TripRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<TripRow[]>('/trips/mine');
      setTrip(all.find((t) => t.rideId === route.params.rideId) ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the trip');
    }
  }, [route.params.rideId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!trip) return error ? <ErrorNote text={error} /> : <Loading />;

  const isDriver = trip.role === 'driver';
  const myBooking = trip.bookings.find((b) => b.passenger.id === user?.id);
  const canCancel = !isDriver && myBooking?.status === 'booked' && trip.status === 'booked';
  // Narrow once: every trip-scoped action (track, chat, start, complete)
  // needs a real trip row, and a ride published before its trip was created
  // would otherwise navigate with a null id.
  const tripId = trip.tripId;
  const canStart = !!tripId && isDriver && trip.status === 'booked';
  const canComplete = !!tripId && isDriver && ['started', 'in_progress'].includes(trip.status);
  const canTrack = !!tripId && ['started', 'in_progress'].includes(trip.status);
  const canPay = !isDriver && ['completed', 'payment_pending'].includes(trip.status) && myBooking;

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
        onPress: () =>
          act(
            () => api(`/bookings/${myBooking!.id}/cancel`, { method: 'POST' }),
            'Could not cancel',
          ),
      },
    ]);
  }

  const phone = isDriver ? trip.bookings[0]?.passenger.phone : trip.driver.phone;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>Trip Details</Text>
        <Badge text={STATUS_LABEL[trip.status] ?? trip.status} tone={STATUS_TONE[trip.status] ?? 'grey'} />
      </View>

      {!!error && <ErrorNote text={error} />}

      <Card>
        <Text style={s.route}>{trip.originLabel} → {trip.destLabel}</Text>
        <Text style={s.meta}>{new Date(trip.departureAt).toLocaleString('en-IN')}</Text>
      </Card>

      <Card>
        <Text style={s.section}>{isDriver ? 'Your vehicle' : 'Driver'}</Text>
        {!isDriver && <Row label="Name" value={trip.driver.name} />}
        <Row label="Vehicle" value={trip.vehicle.model} />
        <Row label="Registration" value={trip.vehicle.registrationNo} />
      </Card>

      {isDriver ? (
        <Card>
          <Text style={s.section}>Passengers ({trip.bookings.filter((b) => b.status !== 'cancelled').length})</Text>
          {trip.bookings.filter((b) => b.status !== 'cancelled').length === 0 && (
            <Text style={s.meta}>Nobody has booked yet.</Text>
          )}
          {trip.bookings
            .filter((b) => b.status !== 'cancelled')
            .map((b) => (
              <View key={b.id} style={s.passenger}>
                <Text style={s.passengerName}>{b.passenger.name}</Text>
                <Text style={s.meta}>
                  {b.pickupLabel} → {b.dropLabel} · {b.seats} seat(s) · ₹{b.fareTotal}
                </Text>
              </View>
            ))}
        </Card>
      ) : myBooking ? (
        <Card>
          <Text style={s.section}>Your journey</Text>
          <Row label="Pick up point" value={myBooking.pickupLabel} />
          <Row label="Drop point" value={myBooking.dropLabel} />
          <Row label="Seats" value={String(myBooking.seats)} />
          <Row label="Fare" value={`₹${myBooking.fareTotal}`} />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {canTrack && (
          <Button title="Track Ride" onPress={() => navigation.navigate('TrackRide', { tripId: tripId!, rideId: trip.rideId, isDriver })} />
        )}
        {canStart && (
          <Button
            title="Start Trip"
            onPress={() => act(() => api(`/trips/${tripId}/start`, { method: 'POST' }), 'Could not start')}
            loading={busy}
          />
        )}
        {canComplete && (
          <Button
            title="Complete Trip"
            onPress={() => act(() => api(`/trips/${tripId}/complete`, { method: 'POST' }), 'Could not complete')}
            loading={busy}
          />
        )}
        {canPay && (
          <Button
            title={`Pay ₹${myBooking!.fareTotal}`}
            onPress={() => navigation.navigate('Payment', { bookingId: myBooking!.id, amount: myBooking!.fareTotal })}
          />
        )}

        {!!tripId && (
          <Button
            title="Chat"
            variant="secondary"
            onPress={() => navigation.navigate('Chat', { tripId })}
          />
        )}

        {/* tel: link rather than in-app calling — no telephony dependency,
            and it uses the dialer the user already trusts. */}
        {!!phone && (
          <Button
            title={isDriver ? 'Call Passenger' : 'Call Driver'}
            variant="secondary"
            onPress={() => Linking.openURL(`tel:${phone}`)}
          />
        )}

        {canCancel && <Button title="Cancel Booking" variant="danger" onPress={cancelBooking} loading={busy} />}
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  route: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  passenger: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  passengerName: { fontSize: 15, fontWeight: '600', color: colors.text },
});
