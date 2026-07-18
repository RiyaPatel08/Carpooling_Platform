import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

/** Mockup's dashboard: greeting plus the two things the app exists to do. */
export default function Dashboard({ navigation }: ScreenProps<'Dashboard'>) {
  const { user } = useAuth();

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.hello}>Hello {user?.name?.split(' ')[0] ?? 'there'}</Text>
      <Text style={s.sub}>Where are you heading today?</Text>

      <Pressable style={[s.action, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('FindRide')}>
        <Text style={s.actionTitle}>Find Ride</Text>
        <Text style={s.actionSub}>Search rides matching your route and schedule</Text>
      </Pressable>

      <Pressable style={[s.action, { backgroundColor: colors.primaryDark }]} onPress={() => navigation.navigate('OfferRide')}>
        <Text style={s.actionTitle}>Offer Ride</Text>
        <Text style={s.actionSub}>Publish a ride for your colleagues</Text>
      </Pressable>

      <View style={s.quickRow}>
        <Quick label="My Trips" onPress={() => navigation.navigate('MyTrips')} />
        <Quick label="My Vehicle" onPress={() => navigation.navigate('MyVehicle')} />
      </View>
      <View style={s.quickRow}>
        <Quick label="Wallet" onPress={() => navigation.navigate('Wallet')} />
        <Quick label="Ride History" onPress={() => navigation.navigate('RideHistory')} />
      </View>
    </ScrollView>
  );
}

function Quick({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={s.quick} onPress={onPress}>
      <Text style={s.quickText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  hello: { fontSize: 26, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  sub: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
  action: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  actionTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  actionSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  quick: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  quickText: { fontWeight: '600', color: colors.text },
});
