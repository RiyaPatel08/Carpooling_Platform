import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '../theme';

/**
 * Cold-start brand moment, per the mockup's Splash Screen frame: the
 * carpool glyph and "Ride Together / Save Together" on the brand colour.
 * App.tsx holds this on screen for a minimum duration (see MIN_SPLASH_MS)
 * so it reads as a screen rather than a flicker on a fast session restore.
 */
export default function Splash() {
  return (
    <View style={s.wrap}>
      <View style={s.badge}>
        <Ionicons name="car-sport" size={56} color={colors.primary} />
      </View>
      <Text style={s.brand}>Carpooling</Text>
      <Text style={s.tagline}>Ride Together{'\n'}Save Together</Text>
      <ActivityIndicator color="#fff" style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  brand: { fontSize: 34, fontWeight: '800', color: '#fff' },
  tagline: {
    fontSize: 16, color: 'rgba(255,255,255,0.9)', marginTop: spacing.sm,
    textAlign: 'center', lineHeight: 22,
  },
});
