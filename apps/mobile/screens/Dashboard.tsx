import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, Badge, Card } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/notifications';
import { colors, radius, spacing } from '../theme';
import { STATUS_LABEL, STATUS_TONE, type TripRow } from './MyTrips';
import { photoSrc } from './Profile';
import type { TabScreenProps } from '../lib/navigation';

/**
 * Home. The mockup's two big actions, plus the one thing every ride-hailing
 * app puts first: whatever is happening right now. A driver mid-trip should
 * reach the map in one tap, not by remembering which tab it lives under.
 */
export default function Dashboard({ navigation }: TabScreenProps<'Dashboard'>) {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    // Both are decorative; a dashboard must still render if either fails.
    await Promise.all([
      api<TripRow[]>('/trips/mine').then(setTrips).catch(() => setTrips([])),
      api<{ balance: number }>('/wallet')
        .then((w) => setWalletBalance(w.balance))
        .catch(() => setWalletBalance(null)),
    ]);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // "Live" means startable or already moving — the trip you'd want one tap to.
  const live = trips.find(
    (t) =>
      t.rideStatus !== 'cancelled' &&
      ['booked', 'started', 'in_progress'].includes(t.status) &&
      new Date(t.departureAt).getTime() > Date.now() - 6 * 3600_000,
  );

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <ScrollView
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
    >
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.hello}>{greeting}</Text>
          <Text style={s.name}>{user?.name?.split(' ')[0] ?? 'there'}</Text>
        </View>
        <View>
          <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8} accessibilityLabel="Profile">
            <Avatar uri={photoSrc(user?.photoUrl)} name={user?.name} size={44} />
          </Pressable>
          {unread > 0 && (
            <Pressable
              onPress={() => navigation.navigate('Notifications')}
              hitSlop={8}
              style={s.dot}
              accessibilityLabel={`${unread} unread notifications`}
            >
              <Text style={s.dotText}>{unread > 9 ? '9+' : unread}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Active trip first: this is the "what now" card. */}
      {live && (
        <Pressable onPress={() => navigation.navigate('TripDetails', { rideId: live.rideId })}>
          <Card style={s.liveCard}>
            <View style={s.liveHead}>
              <Badge
                text={live.role === 'driver' ? 'You are driving' : 'You are riding'}
                tone={live.role === 'driver' ? 'green' : 'grey'}
              />
              <Badge text={STATUS_LABEL[live.status] ?? live.status} tone={STATUS_TONE[live.status] ?? 'grey'} />
            </View>
            <Text style={s.liveRoute} numberOfLines={1}>
              {live.originLabel} → {live.destLabel}
            </Text>
            <Text style={s.liveMeta}>
              {new Date(live.departureAt).toLocaleString('en-IN', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
            <View style={s.liveCta}>
              <Ionicons
                name={['started', 'in_progress'].includes(live.status) ? 'navigate' : 'arrow-forward'}
                size={16}
                color={colors.primary}
              />
              <Text style={s.liveCtaText}>
                {['started', 'in_progress'].includes(live.status) ? 'Track live' : 'View trip'}
              </Text>
            </View>
          </Card>
        </Pressable>
      )}

      <Action
        icon="search"
        title="Find a Ride"
        subtitle={
          live?.role === 'passenger'
            ? 'You already have an active booking — tap to view it'
            : 'Search rides matching your route and schedule'
        }
        background={colors.primary}
        blocked={live?.role === 'passenger'}
        onPress={() =>
          live?.role === 'passenger'
            ? navigation.navigate('TripDetails', { rideId: live.rideId })
            : navigation.navigate('FindRide')
        }
      />
      <Action
        icon="car-sport"
        title="Offer a Ride"
        subtitle={
          live?.role === 'driver'
            ? 'You already have an ongoing ride — tap to view it'
            : 'Publish a ride and share your fuel cost'
        }
        background={colors.primaryDark}
        blocked={live?.role === 'driver'}
        onPress={() =>
          live?.role === 'driver'
            ? navigation.navigate('TripDetails', { rideId: live.rideId })
            : navigation.navigate('OfferRide')
        }
      />

      <Text style={s.section}>Quick access</Text>
      <View style={s.grid}>
        <Quick icon="list" label="My Trips" onPress={() => navigation.navigate('MyTrips')} />
        <Quick icon="construct" label="My Vehicle" onPress={() => navigation.navigate('MyVehicle')} />
        <Quick
          icon="wallet"
          label="Wallet"
          hint={walletBalance != null ? `₹${walletBalance.toFixed(0)}` : undefined}
          onPress={() => navigation.navigate('Wallet')}
        />
        <Quick icon="time" label="History" onPress={() => navigation.navigate('RideHistory')} />
        <Quick icon="bar-chart" label="Reports" onPress={() => navigation.navigate('Reports')} />
        <Quick icon="help-buoy" label="Help" onPress={() => navigation.navigate('Help')} />
      </View>
    </ScrollView>
  );
}

function Action({
  icon, title, subtitle, background, onPress, blocked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  background: string;
  onPress: () => void;
  /** Already has an active ride/booking in the conflicting role — the tile
   *  still works (it routes to that trip instead), just reads as "taken". */
  blocked?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.action,
        { backgroundColor: blocked ? colors.textMuted : background, opacity: pressed ? 0.9 : 1 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={s.actionIcon}>
        <Ionicons name={blocked ? 'lock-closed' : icon} size={22} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
}

function Quick({
  icon, label, hint, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={s.quick} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={s.quickText}>{label}</Text>
      {!!hint && <Text style={s.quickHint}>{hint}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, marginTop: spacing.sm },
  hello: { fontSize: 14, color: colors.textMuted },
  name: { fontSize: 26, fontWeight: '700', color: colors.text },
  dot: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: colors.background,
  },
  dotText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  liveCard: { borderColor: colors.primary, borderWidth: 1.5 },
  liveHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  liveRoute: { fontSize: 16, fontWeight: '700', color: colors.text },
  liveMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  liveCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  liveCtaText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
  },
  actionIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  actionSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  section: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quick: {
    // Three per row, accounting for the two gaps between them.
    width: '31.5%', backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', gap: 6,
  },
  quickText: { fontWeight: '600', color: colors.text, fontSize: 12 },
  quickHint: { color: colors.primary, fontSize: 11, fontWeight: '700' },
});
