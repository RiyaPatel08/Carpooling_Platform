import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, ErrorNote } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, spacing } from '../theme';
import type { ScreenProps } from '../lib/navigation';

type Method = 'cash' | 'card' | 'upi' | 'wallet';

const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: 'wallet', label: 'Wallet', hint: 'Pay instantly from your balance' },
  { key: 'cash', label: 'Cash Payment', hint: 'Hand cash to the driver' },
  { key: 'card', label: 'Card Payment', hint: 'Test mode' },
  { key: 'upi', label: 'UPI Payment', hint: 'Test mode' },
];

export default function Payment({ route, navigation }: ScreenProps<'Payment'>) {
  const { bookingId, amount } = route.params;
  const [method, setMethod] = useState<Method>('wallet');
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ balance: number }>('/wallet').then((w) => setBalance(w.balance)).catch(() => setBalance(null));
  }, []);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await api(`/payments/${bookingId}`, {
        method: 'POST',
        body: JSON.stringify({ method }),
      });
      Alert.alert('Payment successful', `₹${amount} paid.`, [
        { text: 'Done', onPress: () => navigation.navigate('RideHistory') },
      ]);
    } catch (e) {
      // Insufficient balance is a normal outcome, not a crash: show it
      // inline with a route to the fix.
      setError(e instanceof ApiError ? e.message : 'Payment failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const shortOnWallet = method === 'wallet' && balance !== null && balance < amount;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>Payment</Text>

      <Card>
        <Text style={s.amountLabel}>Amount due</Text>
        <Text style={s.amount}>₹{amount}</Text>
        {balance !== null && <Text style={s.meta}>Wallet balance: ₹{balance.toFixed(2)}</Text>}
      </Card>

      {!!error && <ErrorNote text={error} />}

      <Text style={s.section}>Payment Method</Text>
      {METHODS.map((m) => {
        const on = m.key === method;
        return (
          <Pressable
            key={m.key}
            onPress={() => { setMethod(m.key); setError(null); }}
            style={[s.method, on && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
          >
            <Text style={[s.methodLabel, on && { color: colors.primaryDark }]}>{m.label}</Text>
            <Text style={s.meta}>{m.hint}</Text>
          </Pressable>
        );
      })}

      {shortOnWallet && (
        <View style={s.warn}>
          <Text style={{ color: colors.warning, fontSize: 14 }}>
            Your wallet is ₹{(amount - balance!).toFixed(2)} short. Recharge, or pick another method.
          </Text>
          <Button
            title="Recharge Wallet"
            variant="secondary"
            onPress={() => navigation.navigate('Wallet')}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      <Button title={`Pay ₹${amount}`} onPress={pay} loading={busy} style={{ marginTop: spacing.md }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  amountLabel: { fontSize: 13, color: colors.textMuted },
  amount: { fontSize: 34, fontWeight: '800', color: colors.text, marginVertical: 4 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  method: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface,
  },
  methodLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  warn: { backgroundColor: '#FDF1DE', padding: spacing.md, borderRadius: radius.md, marginTop: spacing.sm },
});
