import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { api } from '../api';
import { approveAndSign, ensureDeviceRegistered } from '../lib/deviceKey';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type SendScreenProps = StackScreenProps<RootStackParamList, 'Send'>;

type TransferKind = 'internal' | 'bank' | 'merchant';

export default function SendScreen({ navigation }: SendScreenProps) {
  const [type, setType] = useState<TransferKind>('internal');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => Crypto.randomUUID());
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [sent, setSent] = useState<any>(null);
  const [biometric, setBiometric] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ensureDeviceRegistered()
      .then((id) => {
        if (!cancelled) setDeviceId(id);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.response?.data?.message || e.message || 'Could not register this device');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const createDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = deviceId ?? (await ensureDeviceRegistered());
      setDeviceId(id);
      const data = await api.createTransferDraft({
        type,
        amount,
        idempotencyKey,
        deviceId: id,
        ...(type === 'internal'
          ? recipient.includes('@')
            ? { recipientHandle: recipient }
            : { recipientPhone: recipient }
          : {}),
        ...(type === 'bank' ? { bankCode, accountNumber } : {}),
        ...(type === 'merchant' ? { orderReference } : {}),
      });
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
    setLoading(true);
    setError(null);
    try {
      // The phone's biometric unlocks the device key, which signs the exact
      // payloadHash the server issued. The server verifies before posting.
      const approval = await approveAndSign(draft.challenge.payloadHash);
      setBiometric(approval.biometric);
      const result = await api.submitTransfer(draft.transfer.id, approval.signature);
      setSent(result.transfer);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to submit transfer');
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setDraft(null);
    setSent(null);
    setError(null);
    setIdempotencyKey(Crypto.randomUUID());
  };

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Payment sent</Text>
        <Text style={styles.confirmAmount}>{sent.currency} {sent.amount}</Text>
        <Text style={styles.confirmLine}>To {sent.recipientName}</Text>
        <Text style={styles.confirmLine}>Status: {sent.status}</Text>
        {!biometric && (
          <Text style={styles.warning}>
            No biometric hardware on this device, so approval was not biometric-gated.
          </Text>
        )}
        <Button title="Done" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send Money</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {!draft ? (
        <>
          <View style={styles.types}>
            {(['internal', 'bank', 'merchant'] as TransferKind[]).map((kind) => (
              <TouchableOpacity
                key={kind}
                style={[styles.typeChip, type === kind && styles.typeChipActive]}
                onPress={() => setType(kind)}
              >
                <Text style={type === kind ? styles.typeTextActive : styles.typeText}>{kind}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Amount (NGN)</Text>
          <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="numeric" />

          {type === 'internal' && (
            <>
              <Text style={styles.label}>Recipient (phone or handle)</Text>
              <TextInput style={styles.input} placeholder="+23480... or @handle" value={recipient} onChangeText={setRecipient} autoCapitalize="none" />
            </>
          )}

          {type === 'bank' && (
            <>
              <Text style={styles.label}>Bank code</Text>
              <TextInput style={styles.input} placeholder="e.g. 058" value={bankCode} onChangeText={setBankCode} autoCapitalize="none" />
              <Text style={styles.label}>Account number</Text>
              <TextInput style={styles.input} placeholder="10 digits" value={accountNumber} onChangeText={setAccountNumber} keyboardType="numeric" />
            </>
          )}

          {type === 'merchant' && (
            <>
              <Text style={styles.label}>Merchant order reference</Text>
              <TextInput style={styles.input} placeholder="ord_..." value={orderReference} onChangeText={setOrderReference} autoCapitalize="none" />
            </>
          )}

          <Button title="Review payment" onPress={createDraft} disabled={loading || !deviceId} />
          {!deviceId && !error && <Text style={styles.hint}>Registering this device…</Text>}
        </>
      ) : (
        <>
          {/* Rendered by the app from server data, never by the agent. */}
          <Text style={styles.label}>Confirm this payment</Text>
          <Text style={styles.confirmAmount}>{draft.transfer.currency} {draft.transfer.amount}</Text>
          <Text style={styles.confirmLine}>To {draft.transfer.recipientName}</Text>
          <Text style={styles.confirmLine}>Fee: {draft.transfer.currency} {draft.transfer.fee}</Text>
          <Text style={styles.confirmLine}>Total: {totalLabel(draft.transfer)}</Text>
          <Text style={styles.hint}>Approve with your fingerprint or face to sign.</Text>
          <Button title="Approve & Sign" onPress={submit} disabled={loading} />
          <TouchableOpacity style={styles.link} onPress={startOver}>
            <Text style={styles.linkText}>Cancel</Text>
          </TouchableOpacity>
        </>
      )}

      {loading && <ActivityIndicator size="small" />}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Exact minor-unit addition. The ledger never touches floats, so the total the
 * customer approves is computed the same way rather than with Number().
 */
function totalLabel(transfer: { amount: string; fee: string; currency: string }): string {
  const totalMinor = toMinor(transfer.amount) + toMinor(transfer.fee);
  return `${transfer.currency} ${totalMinor / 100n}.${(totalMinor % 100n).toString().padStart(2, '0')}`;
}

function toMinor(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12 },
  warning: { color: '#b26a00', fontSize: 13, marginBottom: 12 },
  hint: { fontSize: 13, color: '#888', marginTop: 8, marginBottom: 8 },
  label: { fontSize: 14, color: '#666', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  types: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  typeChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: '#ccc' },
  typeChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  typeText: { color: '#333', fontSize: 14 },
  typeTextActive: { color: '#fff', fontSize: 14, fontWeight: '600' },
  confirmAmount: { fontSize: 30, fontWeight: 'bold', marginTop: 8 },
  confirmLine: { fontSize: 16, color: '#333', marginTop: 6 },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});