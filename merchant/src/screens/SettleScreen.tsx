import { useEffect, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { api } from '../api';
import { approveAndSign, ensureDeviceRegistered } from '../lib/deviceKey';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../navigation';

type SettleScreenProps = StackScreenProps<RootStackParamList, 'Settle'>;

type Stage = 'form' | 'confirm' | 'done';

export default function SettleScreen({ navigation }: SettleScreenProps) {
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [draft, setDraft] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [biometric, setBiometric] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kybStatus, setKybStatus] = useState<string | null>(null);

  useEffect(() => {
    api.getMerchantProfile().then((p: any) => setKybStatus(p.kybStatus)).catch(() => {});
  }, []);

  const kybBlocked = kybStatus !== null && kybStatus !== 'verified';

  const startOver = () => {
    setStage('form');
    setDraft(null);
    setResult(null);
    setError(null);
    setBiometric(true);
  };

  const review = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = await ensureDeviceRegistered();
      const data = await api.createSettlementDraft(deviceId, amount.trim() || undefined);
      setDraft(data);
      setStage('confirm');
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Could not prepare the settlement');
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!draft?.challenge || !draft?.settlement) return;
    setLoading(true);
    setError(null);
    try {
      const approval = await approveAndSign(draft.challenge.payloadHash);
      setBiometric(approval.biometric);
      const data = await api.submitSettlement(draft.settlement.id, approval.signature);
      setResult(data);
      setStage('done');
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Settlement failed');
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'done' && result) {
    const failed = result.status === 'failed';
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Settle to Bank</Text>
        <View style={[styles.card, failed ? styles.cardFailed : styles.cardOk]}>
          <Text style={styles.cardAmount}>NGN {result.amount}</Text>
          <Text style={styles.cardStatus}>{statusLabel(result.status)}</Text>
          {result.failureReason ? <Text style={styles.cardNote}>{result.failureReason}</Text> : null}
          {result.status === 'processing' ? (
            <Text style={styles.cardNote}>Paga is processing the payout. It will complete shortly.</Text>
          ) : null}
        </View>
        {!biometric && <Text style={styles.warn}>Approved without biometrics (no hardware on this device).</Text>}
        <TouchableOpacity style={styles.primary} onPress={startOver}>
          <Text style={styles.primaryText}>Settle again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (stage === 'confirm' && draft) {
    const payload = draft.challenge?.payload ?? {};
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Confirm settlement</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.card}>
          <Text style={styles.cardAmount}>NGN {draft.settlement.amount}</Text>
          <Text style={styles.cardNote}>To {payload.accountName ?? 'your bank account'}</Text>
          <Text style={styles.cardNote}>
            {payload.accountNumber ?? ''} {payload.bankCode ? `· bank ${payload.bankCode}` : ''}
          </Text>
        </View>
        <Text style={styles.hint}>Approve with your biometric to send this payout to your bank.</Text>
        <TouchableOpacity style={styles.primary} onPress={approve} disabled={loading}>
          <Text style={styles.primaryText}>{loading ? 'Approving…' : 'Approve & settle'}</Text>
        </TouchableOpacity>
        {loading && <ActivityIndicator size="small" style={styles.spinner} />}
        <TouchableOpacity style={styles.link} onPress={startOver} disabled={loading}>
          <Text style={styles.linkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settle to Bank</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {kybBlocked && (
        <View style={styles.kybBanner}>
          <Text style={styles.kybText}>
            Business verification is {kybStatus}. Settlements unlock once your business has been
            verified.
          </Text>
        </View>
      )}
      <Text style={styles.label}>Amount (NGN)</Text>
      <TextInput
        style={styles.input}
        placeholder="Leave empty for full balance"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        editable={!loading}
      />
      <TouchableOpacity style={styles.primary} onPress={review} disabled={loading || kybBlocked}>
        <Text style={styles.primaryText}>{loading ? 'Preparing…' : 'Review settlement'}</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator size="small" style={styles.spinner} />}
      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Paid out to your bank';
    case 'processing':
      return 'Processing';
    case 'pending':
      return 'Submitted';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12 },
  warn: { color: '#B26A00', fontSize: 13, marginBottom: 12 },
  kybBanner: { backgroundColor: '#FFF4E0', borderRadius: 8, padding: 12, marginBottom: 12 },
  kybText: { color: '#8A5A00', fontSize: 13 },
  label: { fontSize: 14, color: '#666', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  hint: { color: '#666', fontSize: 13, marginBottom: 16 },
  card: { backgroundColor: '#F2F6FF', borderRadius: 12, padding: 20, marginBottom: 16 },
  cardOk: { backgroundColor: '#E9F7EF' },
  cardFailed: { backgroundColor: '#FDECEA' },
  cardAmount: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  cardStatus: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardNote: { fontSize: 14, color: '#444', marginTop: 2 },
  primary: { backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  spinner: { marginTop: 12 },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#007AFF', fontSize: 14 },
});