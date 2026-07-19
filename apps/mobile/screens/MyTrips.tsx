import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Badge, Empty, ErrorNote, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';
import type { TabScreenProps } from '../lib/navigation';

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

/**
 * A soft top-left-to-bottom-right wash per status tone, so the state a trip
 * is in reads at a glance instead of only from the badge text — the badges
 * alone (grey text on pale grey, amber on pale amber) turned out too close
 * in weight to separate quickly in a scrolling list. `booked` stays flat:
 * it is the default, unremarkable state, and giving it a tint too would
 * just add noise to the common case.
 */
const STATUS_GRADIENT: Record<'green' | 'amber' | 'red' | 'grey', [string, string]> = {
  green: ['#DFF6EA', colors.surface],
  amber: ['#FBEDD2', colors.surface],
  red: ['#FBDEDC', colors.surface],
  grey: [colors.surface, colors.surface],
};

function StatusCard({
  tone, style, children,
}: {
  tone: 'green' | 'amber' | 'red' | 'grey';
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={STATUS_GRADIENT[tone]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.6 }}
      style={[s.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

export default function MyTrips({ navigation }: TabScreenProps<'MyTrips'>) {
  const { user } = useAuth();
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

  if (trips === null) return <Loading text="Loading your trips…" />;

  // Cancelled rides stay in the list rather than vanishing. A ride the driver
  // pulled is information the passenger needs; silently removing it is how
  // someone ends up waiting at a pickup point for a car that is not coming.
  const active = trips.filter(
    (t) => t.status !== 'payment_completed' && t.rideStatus !== 'cancelled',
  );
  const cancelled = trips.filter((t) => t.rideStatus === 'cancelled');
  const data = [...active, ...cancelled];

  return (
    <FlatList
      data={data}
      keyExtractor={(t) => t.rideId}
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          <Text style={s.title}>My Trips</Text>
          {!!error && <ErrorNote text={error} />}
        </>
      }
      ListEmptyComponent={
        <Empty
          icon="car-outline"
          text="No active trips yet. Find a ride to work, or offer one and share your fuel cost."
          action={{ title: 'Find a Ride', onPress: () => navigation.navigate('FindRide') }}
        />
      }
      renderItem={({ item }) => {
        const isCancelled = item.rideStatus === 'cancelled';
        const seatsBooked = item.seatsTotal - item.seatsAvailable;
        // A mid-trip join request in flight overrides the trip's own status —
        // otherwise a passenger whose seat isn't confirmed yet would see
        // "Started" and reasonably assume they're already aboard.
        const myBooking = item.role === 'passenger'
          ? item.bookings.find((b) => b.passenger.id === user?.id)
          : undefined;
        const isRequested = myBooking?.status === 'requested';
        const tone = isCancelled ? 'red' : isRequested ? 'amber' : STATUS_TONE[item.status] ?? 'grey';
        return (
          <Pressable onPress={() => navigation.navigate('TripDetails', { rideId: item.rideId })}>
            <StatusCard tone={tone} style={isCancelled ? s.cancelledCard : undefined}>
              <View style={s.head}>
                <Badge
                  text={item.role === 'driver' ? 'Driving' : 'Riding'}
                  tone={item.role === 'driver' ? 'green' : 'grey'}
                />
                <Badge
                  text={isCancelled ? 'Cancelled' : isRequested ? 'Requested' : STATUS_LABEL[item.status] ?? item.status}
                  tone={isCancelled ? 'red' : isRequested ? 'amber' : STATUS_TONE[item.status] ?? 'grey'}
                />
              </View>

              <View style={s.routeRow}>
                <View style={s.rail}>
                  <View style={s.dotFrom} />
                  <View style={s.railLine} />
                  <View style={s.dotTo} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={s.place} numberOfLines={1}>{item.originLabel}</Text>
                  <Text style={s.place} numberOfLines={1}>{item.destLabel}</Text>
                </View>
              </View>

              <View style={s.footer}>
                <View style={s.metaRow}>
                  <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                  <Text style={s.meta}>
                    {new Date(item.departureAt).toLocaleString('en-IN', {
                      hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
                    })}
                  </Text>
                </View>
                <View style={s.metaRow}>
                  <Ionicons
                    name={item.role === 'driver' ? 'people-outline' : 'person-outline'}
                    size={13}
                    color={colors.textMuted}
                  />
                  <Text style={s.meta}>
                    {item.role === 'driver'
                      ? `${seatsBooked}/${item.seatsTotal} booked`
                      : item.driver.name}
                  </Text>
                </View>
              </View>
            </StatusCard>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  card: {
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  cancelledCard: { opacity: 0.72, borderColor: '#F3D4D2' },
  routeRow: { flexDirection: 'row', gap: spacing.sm },
  rail: { alignItems: 'center', paddingTop: 5 },
  railLine: { width: 2, flex: 1, minHeight: 14, backgroundColor: colors.border, marginVertical: 2 },
  dotFrom: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  dotTo: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  place: { fontSize: 15, fontWeight: '600', color: colors.text },
  footer: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md,
    marginTop: spacing.md, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 13, color: colors.textMuted },
});
