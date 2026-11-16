import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../api';
import QRCode from 'react-native-qrcode-svg';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type CreateOrderScreenProps = StackScreenProps<RootStackParamList, 'CreateOrder'>;

const POLL_INTERVAL_MS = 3000;

export default function CreateOrderScreen({ navigation }: CreateOrderScreenProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

  const expired = order?.expiresAt ? new Date(order.expiresAt).getTime() <= Date.now() : false;
  const waiting = order?.status === 'open' && !expired;

  // Poll the order until the customer's payment commits (or the order dies).
  // The interval is torn down on unmount and whenever the status changes.
  useEffect(() => {
    if (!order || !waiting) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const latest = await api.getOrder(order.reference);
        if (!cancelled) setOrder(latest);
      } catch {
        // A transient lookup failure must not kill the polling loop.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [order?.reference, order?.status, expired]);

  const createOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.createOrder(amount, note || undefined);
      setOrder(data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setOrder(null);
    setError(null);
  };

  if (order?.status === 'paid') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Payment received</Text>
        <View style={styles.paidCard}>
          <Text style={styles.paidAmount}>{order.currency} {order.amount}</Text>
          <Text style={styles.paidLabel}>from a customer</Text>
          <Text style={styles.qrRef}>{order.reference}</Text>
        </View>
        <Button title="Create another order" onPress={startOver} />
        <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Payment Order</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {!order ? (
        <>
          <Text style={styles.label}>Amount (NGN)</Text>
          <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput style={styles.input} placeholder="e.g. Groceries" value={note} onChangeText={setNote} />
          <Button title="Create Order" onPress={createOrder} disabled={loading} />
          {loading && <ActivityIndicator size="small" />}
        </>
      ) : (
        <View style={styles.qrContainer}>
          {waiting ? (
            <>
              <Text style={styles.qrLabel}>Show this QR to the customer</Text>
              <QRCode value={order.qrPayload} size={240} />
              <Text style={styles.qrRef}>{order.reference}</Text>
              <Text style={styles.orderAmount}>{order.currency} {order.amount}</Text>
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" />
                <Text style={styles.waitingText}>Waiting for payment…</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.expiredText}>
                This order {order.status === 'open' ? 'has expired' : `is ${order.status}`}.
              </Text>
              <Button title="Create another order" onPress={startOver} />
            </>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12 },
  label: { fontSize: 14, color: '#666', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  qrContainer: { alignItems: 'center', marginTop: 24 },
  qrLabel: { fontSize: 14, color: '#666', marginBottom: 8 },
  qrRef: { fontSize: 12, color: '#888', marginTop: 8 },
  orderAmount: { fontSize: 24, fontWeight: 'bold', marginTop: 12 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  waitingText: { fontSize: 14, color: '#666' },
  expiredText: { fontSize: 16, color: '#b26a00', marginBottom: 16, textAlign: 'center' },
  paidCard: { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 24 },
  paidAmount: { fontSize: 32, fontWeight: 'bold', color: '#1b5e20' },
  paidLabel: { fontSize: 14, color: '#4caf50', marginTop: 4 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});