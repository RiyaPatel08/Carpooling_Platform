import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';
import { STATUS_LABEL, STATUS_TONE, type TripRow } from './MyTrips';

/** PS §5.7: participants, route, vehicle, date/time, status. */
export default function RideHistory() {
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTrips(await api<TripRow[]>('/trips/history'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your history');
      setTrips([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (trips === null) return <Loading />;

  return (
    <FlatList
      data={trips}
      keyExtractor={(t) => t.rideId}
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={s.title}>Ride History</Text>
          {!!error && <ErrorNote text={error} />}
        </>
      }
      ListEmptyComponent={<Empty text="No completed rides yet." />}
      renderItem={({ item }) => {
        const participants =
          item.role === 'driver'
            ? item.bookings.map((b) => b.passenger.name).join(', ') || 'No passengers'
            : item.driver.name;

        return (
          <Card>
            <View style={s.head}>
              <Badge text={item.role === 'driver' ? 'Drove' : 'Rode'} tone="grey" />
              <Badge text={STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? 'grey'} />
            </View>

            <Text style={s.route}>{item.originLabel} → {item.destLabel}</Text>
            <Text style={s.meta}>{new Date(item.departureAt).toLocaleString('en-IN')}</Text>
            <Text style={s.meta}>
              {item.role === 'driver' ? 'Passengers: ' : 'Driver: '}{participants}
            </Text>
            <Text style={s.meta}>
              {item.vehicle.model} · {item.vehicle.registrationNo}
            </Text>
          </Card>
        );
      }}
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
