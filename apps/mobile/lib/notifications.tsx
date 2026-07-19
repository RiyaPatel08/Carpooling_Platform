import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Notification, NotificationKind } from '@syncroute/shared';
import { useAuth } from './auth';
import { getSocket } from './socket';
import { goToTab, navigateFromAnywhere } from './navigation';
import { colors, radius, spacing } from '../theme';

/**
 * In-app notifications.
 *
 * One socket listener for the whole app, mounted above the navigator, so an
 * event reaches the user wherever they are — the driver sitting on the
 * dashboard when a booking lands is the case that motivated this.
 *
 * Deliberately not expo-notifications: PLANNING lists push infra as an
 * anti-goal, and system push needs a dev build plus a credentials dance that
 * buys nothing for a foregrounded demo.
 */

interface Ctx {
  items: Notification[];
  unread: number;
  markAllRead: () => void;
}

const NotificationContext = createContext<Ctx>({ items: [], unread: 0, markAllRead: () => {} });

export const useNotifications = () => useContext(NotificationContext);

/** Icon + tint per event, so the banner reads at a glance without the text. */
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

/** Where tapping a notification should land. Shared with the Notifications screen. */
export function destination(n: Notification): (() => void) | null {
  if (n.kind === 'chat_message' && n.tripId) {
    return () => navigateFromAnywhere('Chat', { tripId: n.tripId! });
  }
  if (n.rideId) return () => navigateFromAnywhere('TripDetails', { rideId: n.rideId! });
  // Trip-scoped events without a ride id still have somewhere sensible to go.
  if (n.tripId) return () => goToTab('MyTrips');
  return null;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<Notification | null>(null);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }

    const socket = getSocket();
    const onNotify = (n: Notification) => {
      // Cap the feed: this is a session-lived list, not an inbox.
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
      setToast(n);
    };

    socket.on('notify', onNotify);
    // Remove only OUR handler. socket.off('notify') would also unhook any
    // screen listening to the same event.
    return () => {
      socket.off('notify', onNotify);
    };
  }, [user]);

  const markAllRead = useCallback(() => setUnread(0), []);
  const value = useMemo(() => ({ items, unread, markAllRead }), [items, unread, markAllRead]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toast notification={toast} onDismiss={() => setToast(null)} />
    </NotificationContext.Provider>
  );
}

/** Slide-down banner. Auto-dismisses; tapping it navigates and dismisses. */
function Toast({
  notification,
  onDismiss,
}: {
  notification: Notification | null;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;

    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(slide, { toValue: -160, duration: 220, useNativeDriver: true }).start(
        onDismiss,
      );
    }, 4500);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // onDismiss is stable enough here; re-running on every render would reset
    // the dismiss timer on each parent update and the banner would never leave.
  }, [notification, slide]);

  if (!notification) return null;

  const look = STYLE[notification.kind] ?? STYLE.trip_started;
  const go = destination(notification);

  return (
    <Animated.View
      style={[s.toastWrap, { top: insets.top + spacing.sm, transform: [{ translateY: slide }] }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={s.toast}
        onPress={() => {
          go?.();
          onDismiss();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${notification.title}. ${notification.body}`}
      >
        <View style={[s.iconDot, { backgroundColor: `${look.tint}1A` }]}>
          <Ionicons name={look.icon} size={19} color={look.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{notification.title}</Text>
          <Text style={s.body} numberOfLines={2}>{notification.body}</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toastWrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 999 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    // Elevation on Android, shadow on iOS — the banner must read as floating
    // above the screen it covers.
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
});
