import { useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import type { StackScreenProps } from '@react-navigation/stack';

type SendScreenProps = StackScreenProps<{
  Wallet: undefined;
  Send: undefined;
}, 'Send'>;

export default function SendScreen({ navigation }: SendScreenProps) {
  const { user } = useAuth();
  const [type, setType] = useState<'internal' | 'bank' | 'merchant'>('internal');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);

  const createDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.createTransferDraft(
        type === 'internal' ? 'INTERNAL' : type === 'bank' ? 'BANK' : 'MERCHANT',
        amount,
        idempotencyKey,
        deviceId,
        type === 'internal' ? recipient : undefined,
        type === 'internal' && recipient.includes('@') ? recipient : undefined,
      );
      setDraft(data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create draft');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!draft?.challenge) {
      setError('No challenge to sign');
      return;
    }
    // In production, the device's secure hardware signs challenge.payloadHash
    // with the biometric-unlocked device key. Here we simulate with a placeholder.
    const signature = 'placeholder_device_signature';
    setLoading(true);
    try {
      await api.submitTransfer(draft.transfer.id, signature);
      navigation.goBack();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to submit transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send Money</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <Text style={styles.label}>Recipient (phone or handle)</Text>
      <TextInput style={styles.input} placeholder="+23480..." value={recipient} onChangeText={setRecipient} />
      <Text style={styles.label}>Device ID</Text>
      <TextInput style={styles.input} placeholder="device uuid" value={deviceId} onChangeText={setDeviceId} />
      <Button title={draft ? 'Sign & Submit' : 'Create Draft'} onPress={draft ? submit : createDraft} disabled={loading} />
      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Wallet</Text>
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
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});
