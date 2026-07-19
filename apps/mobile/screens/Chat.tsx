import { useEffect, useRef, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { ErrorNote } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { getSocket, joinTrip, leaveTrip } from '../lib/socket';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

interface Message {
  id: string;
  tripId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export default function Chat({ route }: ScreenProps<'Chat'>) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let active = true;

    // History over REST, then live over the socket. Without the backfill a
    // passenger opening chat mid-trip sees an empty thread.
    api<Message[]>(`/trips/${tripId}/messages`)
      .then((m) => active && setMessages(m))
      .catch(() => undefined);

    // Named handler so the cleanup can remove exactly this listener.
    // socket.off('chat:message') with no handler drops EVERY subscriber,
    // including the notification provider's — leaving the app silent after
    // the first visit to a chat.
    const onMessage = (m: Message) => {
      if (!active || m.tripId !== tripId) return;
      // De-dupe on id: the server echoes to the room, and a reconnect can
      // replay a message that history already delivered.
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    };

    (async () => {
      try {
        await joinTrip(tripId);
      } catch (e) {
        if (active) setError((e as Error).message);
        return;
      }
      getSocket().on('chat:message', onMessage);
    })();

    return () => {
      active = false;
      getSocket().off('chat:message', onMessage);
      leaveTrip(tripId);
    };
  }, [tripId]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    // Clear immediately; the message renders when the server echoes it back,
    // so what you see is what was actually persisted.
    setDraft('');
    getSocket().emit('chat:message', { tripId, body }, (r: { ok: boolean; error?: string }) => {
      if (!r?.ok) setError(r?.error ?? 'Message could not be sent');
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {!!error && <View style={{ padding: spacing.md }}><ErrorNote text={error} /></View>}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={s.empty}>No messages yet. Say hello, or share a landmark for pickup.</Text>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === user?.id;
          return (
            <View style={[s.bubbleWrap, mine ? s.right : s.left]}>
              {!mine && <Text style={s.sender}>{item.senderName}</Text>}
              <View style={[s.bubble, mine ? s.mine : s.theirs]}>
                <Text style={[s.body, mine && { color: '#fff' }]}>{item.body}</Text>
              </View>
              <Text style={s.time}>
                {new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={s.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message…"
          placeholderTextColor={colors.textMuted}
          style={s.input}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable onPress={send} style={s.send}>
          <Text style={s.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.xl },
  bubbleWrap: { marginBottom: spacing.md, maxWidth: '82%' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  sender: { fontSize: 12, color: colors.textMuted, marginBottom: 3, marginLeft: 4 },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  body: { fontSize: 15, color: colors.text },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 3, marginHorizontal: 4 },
  composer: {
    flexDirection: 'row', padding: spacing.sm, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.text,
  },
  send: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
