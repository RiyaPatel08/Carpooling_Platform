import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import type { Place } from '../components/PlacePicker';
import { goToTab, type ScreenProps } from '../lib/navigation';

interface Params { from: Place; to: Place; date: string; seats: number }

interface Ride {
  id: string;
  driver: { id: string; name: string; photoUrl: string | null };
  vehicle: { model: string; registrationNo: string };
  originLabel: string;
  destLabel: string;
  departureAt: string;
  seatsAvailable: number;
  farePerSeat: number;
  routeDistanceM: number | null;
  recurrenceRule: string | null;
  /** 'started' means the driver is already en route — still joinable up to
   *  wherever they currently are; matched only if they haven't passed this
   *  pickup point yet, but the seat needs their sign-off, not just seats left. */
  status: 'published' | 'started' | 'completed' | 'cancelled';
  detourMinutes?: number | null;
  /** Price for the segment this passenger asked for; what they'll be charged. */
  yourFarePerSeat?: number | null;
}

export default function AvailableRides({ route, navigation }: ScreenProps<'AvailableRides'>) {
  const p = route.params;
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({
        fromLat: String(p.from.lat), fromLng: String(p.from.lng),
        toLat: String(p.to.lat), toLng: String(p.to.lng),
        date: p.date, seats: String(p.seats), windowHours: '4',
      });
      setRides(await api<Ride[]>(`/rides/search?${q}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load rides');
      setRides([]);
    }
  }, [p]);

  useEffect(() => { void load(); }, [load]);

  async function book(ride: Ride) {
    setBooking(ride.id);
    try {
      const res = await api<{ id: string; fareTotal: number; seatsRemaining: number; pending: boolean }>(
        `/rides/${ride.id}/book`,
        {
          method: 'POST',
          body: JSON.stringify({
            seats: p.seats,
            // The passenger's own sub-segment, not the driver's endpoints —
            // this is what corridor matching found them a seat for.
            pickup: p.from,
            drop: p.to,
          }),
        },
      );
      if (res.pending) {
        Alert.alert(
          'Request sent',
          "The driver is already on this trip and needs to confirm you still fit. You'll be notified the moment they respond.",
          [{ text: 'View My Trips', onPress: () => goToTab('MyTrips') }],
        );
      } else {
        Alert.alert(
          'Seat booked',
          `₹${res.fareTotal} for ${p.seats} seat(s). ${res.seatsRemaining} left on this ride.`,
          [{ text: 'View My Trips', onPress: () => goToTab('MyTrips') }],
        );
      }
      void load();
    } catch (e) {
      Alert.alert('Could not book', e instanceof ApiError ? e.message : 'Please try again');
      void load();
    } finally {
      setBooking(null);
    }
  }

  if (rides === null) return <Loading text="Finding rides along your route…" />;

  return (
    <FlatList
      data={rides}
      keyExtractor={(r) => r.id}
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={s.title}>Available Rides</Text>
          <Text style={s.sub}>
            {p.from.label} → {p.to.label}
          </Text>
          {!!error && <ErrorNote text={error} />}
        </>
      }
      ListEmptyComponent={
        <Empty text="No colleagues are driving your route around that time. Try widening the time or offering a ride yourself." />
      }
      renderItem={({ item }) => (
        <Card>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.driver}>{item.driver.name}</Text>
              <Text style={s.vehicle}>
                {item.vehicle.model} · {item.vehicle.registrationNo}
              </Text>
            </View>
            <Text style={s.time}>
              {new Date(item.departureAt).toLocaleString('en-IN', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
              })}
            </Text>
          </View>

          <Text style={s.route}>{item.originLabel} → {item.destLabel}</Text>

          {/* Quote the segment price, not the full-route price. Showing
              farePerSeat here while charging the segment fare is how a
              passenger ends up seeing two different numbers for one ride. */}
          {(() => {
            const yours = item.yourFarePerSeat ?? item.farePerSeat;
            const discounted = yours < item.farePerSeat;
            return (
              <View style={s.priceRow}>
                <Text style={s.price}>₹{yours.toFixed(0)}</Text>
                <Text style={s.priceUnit}>
                  / seat{p.seats > 1 ? ` · ₹${(yours * p.seats).toFixed(0)} total` : ''}
                </Text>
                {discounted && (
                  <Text style={s.strike}>₹{item.farePerSeat.toFixed(0)}</Text>
                )}
              </View>
            );
          })()}
          {(item.yourFarePerSeat ?? item.farePerSeat) < item.farePerSeat && (
            <Text style={s.priceNote}>You only ride part of this route</Text>
          )}

          <View style={s.tags}>
            <Badge text={`${item.seatsAvailable} available`} tone="grey" />
            {item.status === 'started' && <Badge text="Already en route" tone="amber" />}
            {/* The number endpoint-matching cannot produce. */}
            {typeof item.detourMinutes === 'number' && (
              <Badge
                text={item.detourMinutes === 0 ? 'On their way' : `+${item.detourMinutes} min detour`}
                tone={item.detourMinutes <= 5 ? 'green' : 'amber'}
              />
            )}
            {item.recurrenceRule && <Badge text={item.recurrenceRule} tone="grey" />}
          </View>

          {item.status === 'started' && (
            <Text style={s.pendingNote}>
              This driver has already left. Requesting a seat needs their OK before it's yours.
            </Text>
          )}

          <Button
            title={item.status === 'started' ? 'Request to Join' : 'Book Now'}
            variant={item.status === 'started' ? 'secondary' : 'primary'}
            onPress={() => book(item)}
            loading={booking === item.id}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: spacing.sm },
  driver: { fontSize: 16, fontWeight: '700', color: colors.text },
  vehicle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  route: { fontSize: 14, color: colors.text, marginBottom: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 22, fontWeight: '700', color: colors.text },
  priceUnit: { fontSize: 13, color: colors.textMuted },
  strike: {
    fontSize: 13, color: colors.textMuted, textDecorationLine: 'line-through',
  },
  priceNote: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pendingNote: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
});
