import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

export interface TripRow {
  rideId: string;
  tripId: string | null;
  role: 'driver' | 'passenger';
  status: string;
  rideStatus: string;
  originLabel: string;
  destLabel: string;
  departureAt: string;
  farePerSeat: number;
  driver: { id: string; name: string; photoUrl: string | null; phone?: string };
  vehicle: { model: string; registrationNo: string };
  seatsTotal: number;
  seatsAvailable: number;
  bookings: {
    id: string;
    passenger: { id: string; name: string; photoUrl: string | null; phone?: string };
    seats: number;
    pickupLabel: string;
    dropLabel: string;
    fareTotal: number;
    status: string;
  }[];
}

export const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'grey'> = {
  booked: 'grey',
  started: 'amber',
  in_progress: 'amber',
  completed: 'green',
  payment_pending: 'amber',
  payment_completed: 'green',
};

export const STATUS_LABEL: Record<string, string> = {
  booked: 'Booked',
  started: 'Started',
  in_progress: 'In progress',
  completed: 'Completed',
  payment_pending: 'Payment pending',
  payment_completed: 'Paid',
};

export default function MyTrips({ navigation }: ScreenProps<'MyTrips'>) {
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrips(await api<TripRow[]>('/trips/mine'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your trips');
      setTrips([]);
    }
  }, []);

  // Reload on focus: coming back from booking or completing must not show
  // stale state.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (trips === null) return <Loading />;

  const active = trips.filter((t) => t.status !== 'payment_completed' && t.rideStatus !== 'cancelled');

  return (
    <FlatList
      data={active}
      keyExtractor={(t) => t.rideId}
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={s.title}>My Trips</Text>
          {!!error && <ErrorNote text={error} />}
        </>
      }
      ListEmptyComponent={<Empty text="No active trips. Find a ride or offer one to get started." />}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('TripDetails', { rideId: item.rideId })}>
          <Card>
            <View style={s.head}>
              <Badge text={item.role === 'driver' ? 'Driving' : 'Riding'} tone={item.role === 'driver' ? 'green' : 'grey'} />
              <Badge text={STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? 'grey'} />
            </View>

            <Text style={s.route}>{item.originLabel} → {item.destLabel}</Text>
            <Text style={s.meta}>
              {new Date(item.departureAt).toLocaleString('en-IN', {
                hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
              })}
              {' · '}
              {item.role === 'driver'
                ? `${item.seatsTotal - item.seatsAvailable}/${item.seatsTotal} seats booked`
                : `${item.driver.name} · ${item.vehicle.model}`}
            </Text>
          </Card>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  route: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
