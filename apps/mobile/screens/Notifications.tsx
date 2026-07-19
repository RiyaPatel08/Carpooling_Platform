import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Notification, NotificationKind } from '@syncroute/shared';
import { Empty } from '../components/ui';
import { destination, useNotifications } from '../lib/notifications';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

const STYLE: Record<NotificationKind, { icon: keyof typeof Ionicons.glyphMap; tint: string }> = {
  booking_created: { icon: 'person-add', tint: colors.success },
  booking_cancelled: { icon: 'close-circle', tint: colors.warning },
  booking_requested: { icon: 'hand-left', tint: colors.warning },
  booking_accepted: { icon: 'checkmark-circle', tint: colors.success },
  booking_declined: { icon: 'close-circle', tint: colors.danger },
  trip_started: { icon: 'navigate', tint: colors.primary },
  trip_completed: { icon: 'checkmark-done', tint: colors.success },
  payment_received: { icon: 'wallet', tint: colors.success },
  chat_message: { icon: 'chatbubble-ellipses', tint: colors.primary },
  safety_alert: { icon: 'warning', tint: colors.danger },
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Where the badge on the Dashboard avatar actually leads. Notifications are
 * live-only — nothing is persisted server-side (see the schema's ponytail
 * note) — so this is the session's feed, capped at 50 by the provider.
 */
export default function Notifications({ navigation }: ScreenProps<'Notifications'>) {
  const { items, markAllRead } = useNotifications();

  // Opening this screen is what "reading" the badge count means.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <FlatList
      data={items}
      keyExtractor={(n, i) => `${n.createdAt}-${i}`}
      contentContainerStyle={s.wrap}
      ListEmptyComponent={<Empty icon="notifications-outline" text="No notifications yet." />}
      renderItem={({ item }) => {
        const look = STYLE[item.kind] ?? STYLE.trip_started;
        const go = destination(item);
        return (
          <Pressable
            style={s.row}
            disabled={!go}
            onPress={() => go?.()}
            accessibilityRole={go ? 'button' : undefined}
          >
            <View style={[s.iconDot, { backgroundColor: `${look.tint}1A` }]}>
              <Ionicons name={look.icon} size={19} color={look.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{item.title}</Text>
              <Text style={s.body}>{item.body}</Text>
            </View>
            <Text style={s.time}>{timeAgo(item.createdAt)}</Text>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, flexGrow: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  iconDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: 11, color: colors.textMuted },
});
