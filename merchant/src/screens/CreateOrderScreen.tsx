import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import QRCode from 'react-native-qrcode-svg';
import type { StackScreenProps } from '@react-navigation/stack';

type CreateOrderScreenProps = StackScreenProps<{
  Dashboard: undefined;
  CreateOrder: undefined;
}, 'CreateOrder'>;

export default function CreateOrderScreen({ navigation }: CreateOrderScreenProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Payment Order</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} placeholder="e.g. Groceries" value={note} onChangeText={setNote} />
      <Button title="Create Order" onPress={createOrder} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      {order && (
        <View style={styles.qrContainer}>
          <Text style={styles.qrLabel}>Show this QR to customer</Text>
          <QRCode value={order.qrPayload} size={240} />
          <Text style={styles.qrRef}>{order.reference}</Text>
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
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
