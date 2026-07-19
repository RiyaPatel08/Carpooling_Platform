import { useState } from 'react';
import { LayoutAnimation, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

// LayoutAnimation is opt-in on Android and silently does nothing without this.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Support contacts.
 *
 * A carpool runs on someone else's schedule, so the two things a stuck user
 * needs are a phone number and a safety route — not a ticket form.
 */
const SUPPORT_PHONE = '+919876500000';
const SUPPORT_EMAIL = 'support@syncroute.example';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How is my fare calculated?',
    a:
      'Fares are cost-sharing, not commercial. The driver\'s fuel cost for the route is worked out from the vehicle\'s mileage and your organisation\'s fuel price, then split between the driver and the passengers. If you only ride part of the route, you pay for that share of the journey rather than the whole trip, subject to a small minimum.',
  },
  {
    q: 'Why can I see a ride that does not start where I do?',
    a:
      'Matching works on the driver\'s whole route, not just its endpoints. If your pickup and drop both fall close to the road they are already driving — and in the same direction — the ride is offered to you, along with how many extra minutes the detour adds for the driver.',
  },
  {
    q: 'Can I cancel after booking?',
    a:
      'Yes, until the driver starts the trip. Your seat is released immediately and the driver is notified. Once the trip has started the seat can no longer be returned, because the driver may already have travelled to your pickup point.',
  },
  {
    q: 'How does live tracking work?',
    a:
      'When the driver starts the trip their phone shares its position with everyone booked on that ride, and only with them. You will see the vehicle move on the map along with an estimated arrival time. Tracking stops automatically when the trip is completed.',
  },
  {
    q: 'What happens if the vehicle leaves the planned route?',
    a:
      'The platform checks every location update against the planned route. If the vehicle stays well off-route for several updates in a row, you and your organisation\'s administrator are alerted automatically. You can also raise an SOS at any time from the tracking screen.',
  },
  {
    q: 'How do I pay?',
    a:
      'After the trip is completed you can pay from your in-app wallet, or by card, UPI, or cash. Wallet payments move the fare from your balance to the driver\'s instantly. Recharge your wallet from the Wallet tab.',
  },
  {
    q: 'Why is my vehicle pending approval?',
    a:
      'Vehicles are approved by your organisation\'s administrator before they can be used to offer rides. This is what keeps the platform limited to verified colleagues and roadworthy vehicles. Contact your administrator if approval is taking too long.',
  },
  {
    q: 'Who can see my location and phone number?',
    a:
      'Only the people on your trip. Your live position is shared with the driver and passengers of that ride while it is in progress, and your phone number is visible to them so pickup can be arranged. Nobody outside your organisation can see any of it.',
  },
];

export default function Help(_props: ScreenProps<'Help'>) {
  const [open, setOpen] = useState<number | null>(0);

  function toggle(i: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((cur) => (cur === i ? null : i));
  }

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.section}>Contact us</Text>

      <ContactRow
        icon="call"
        title="Call customer care"
        subtitle={`${SUPPORT_PHONE} · 24×7`}
        tint={colors.primary}
        onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}
      />
      <ContactRow
        icon="mail"
        title="Email support"
        subtitle={SUPPORT_EMAIL}
        tint={colors.primary}
        onPress={() =>
          Linking.openURL(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('SyncRoute support request')}`,
          )
        }
      />
      <ContactRow
        icon="warning"
        title="Report a safety concern"
        subtitle="Goes straight to your organisation's administrator"
        tint={colors.danger}
        onPress={() =>
          Linking.openURL(
            `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('URGENT: Safety concern')}`,
          )
        }
      />

      <Text style={[s.section, { marginTop: spacing.lg }]}>Frequently asked</Text>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {FAQS.map((f, i) => {
          const expanded = open === i;
          return (
            <View key={f.q} style={i > 0 ? s.divider : undefined}>
              <Pressable
                onPress={() => toggle(i)}
                style={s.q}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <Text style={s.qText}>{f.q}</Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
              {expanded && <Text style={s.a}>{f.a}</Text>}
            </View>
          );
        })}
      </Card>

      <Text style={s.footer}>SyncRoute · Enterprise carpooling</Text>
    </ScrollView>
  );
}

function ContactRow({
  icon, title, subtitle, tint, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={s.contact}>
        <View style={[s.contactIcon, { backgroundColor: `${tint}1A` }]}>
          <Ionicons name={icon} size={20} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.contactTitle}>{title}</Text>
          <Text style={s.contactSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  section: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  contactIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  contactSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  q: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14, paddingHorizontal: spacing.md,
  },
  qText: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.text },
  a: {
    fontSize: 13.5, color: colors.textMuted, lineHeight: 20,
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  footer: {
    textAlign: 'center', color: colors.textMuted, fontSize: 12,
    marginTop: spacing.lg, marginBottom: spacing.md,
  },
});
