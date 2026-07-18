import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, spacing } from '../theme';

interface WalletData {
  balance: number;
  transactions: {
    id: string;
    amount: number;
    type: 'recharge' | 'trip_payment' | 'trip_earning' | 'refund';
    note: string | null;
    createdAt: string;
  }[];
}

const TYPE_LABEL: Record<string, string> = {
  recharge: 'Recharge',
  trip_payment: 'Ride payment',
  trip_earning: 'Ride earning',
  refund: 'Refund',
};

export default function Wallet() {
  const [data, setData] = useState<WalletData | null>(null);
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<WalletData>('/wallet'));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your wallet');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function recharge() {
    const value = Number(amount);
    if (!value || value <= 0) return setError('Enter an amount greater than 0.');

    setBusy(true);
    setError(null);
    try {
      // Create the order, then verify. Without Razorpay keys the API returns
      // a mock order the verify step accepts, so the flow works offline.
      const order = await api<{ mock: boolean; orderId: string }>('/wallet/recharge/order', {
        method: 'POST',
        body: JSON.stringify({ amount: value }),
      });

      await api('/wallet/recharge/verify', {
        method: 'POST',
        body: JSON.stringify({
          razorpayOrderId: order.orderId,
          razorpayPaymentId: `pay_mock_${Date.now()}`,
          razorpaySignature: 'mock',
          amount: value,
        }),
      });

      Alert.alert('Wallet recharged', `₹${value} added.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Recharge failed. No money has been deducted.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <ErrorNote text={error} /> : <Loading />;

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.title}>Wallet</Text>

      <Card>
        <Text style={s.balanceLabel}>Balance</Text>
        <Text style={s.balance}>₹{data.balance.toFixed(2)}</Text>
        <Text style={s.meta}>Summed from your ledger — every entry below is immutable.</Text>
      </Card>

      {!!error && <ErrorNote text={error} />}

      <Card>
        <Text style={s.section}>Recharge Wallet</Text>
        <Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        <Button title={`Add ₹${amount || 0}`} onPress={recharge} loading={busy} />
      </Card>

      <Text style={s.section}>Transactions</Text>
      {data.transactions.length === 0 && <Empty text="No transactions yet." />}
      {data.transactions.map((t) => (
        <Card key={t.id} style={{ marginBottom: spacing.sm }}>
          <View style={s.txnRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.txnType}>{TYPE_LABEL[t.type] ?? t.type}</Text>
              {!!t.note && <Text style={s.meta}>{t.note}</Text>}
              <Text style={s.meta}>{new Date(t.createdAt).toLocaleString('en-IN')}</Text>
            </View>
            {/* Sign is the ledger's own, not a UI convention. */}
            <Text style={[s.txnAmount, { color: t.amount >= 0 ? colors.success : colors.danger }]}>
              {t.amount >= 0 ? '+' : '−'}₹{Math.abs(t.amount).toFixed(2)}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: spacing.md, backgroundColor: colors.background, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  balanceLabel: { fontSize: 13, color: colors.textMuted },
  balance: { fontSize: 34, fontWeight: '800', color: colors.primary, marginVertical: 4 },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  txnType: { fontSize: 15, fontWeight: '600', color: colors.text },
  txnAmount: { fontSize: 16, fontWeight: '700' },
});
