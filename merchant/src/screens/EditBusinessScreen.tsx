import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Button, ErrorBanner, Field, Header, Loading, NoticeBanner, Screen } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'EditBusiness'>;

export default function EditBusinessScreen({ navigation }: Props) {
  const { data: merchant, loading } = useLoad(() => api.getMerchantProfile(), 'Could not load your business');
  const [form, setForm] = useState<{
    businessName: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once the profile arrives.
  if (merchant && !form) {
    setForm({
      businessName: merchant.businessName,
      bankCode: merchant.settlementBankCode ?? '',
      accountNumber: merchant.settlementAccountNumber ?? '',
      accountName: merchant.settlementAccountName ?? '',
    });
  }
  if (loading || !form || !merchant) return <Loading />;

  const bankChanged =
    form.bankCode.trim() !== (merchant.settlementBankCode ?? '') ||
    form.accountNumber.trim() !== (merchant.settlementAccountNumber ?? '') ||
    form.accountName.trim() !== (merchant.settlementAccountName ?? '');
  const nameChanged = form.businessName.trim() !== merchant.businessName;
  const bankComplete = !!form.bankCode.trim() && !!form.accountNumber.trim() && !!form.accountName.trim();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateMerchant({
        ...(nameChanged ? { businessName: form.businessName.trim() } : {}),
        ...(bankChanged
          ? {
              settlementBankCode: form.bankCode.trim(),
              settlementAccountNumber: form.accountNumber.trim(),
              settlementAccountName: form.accountName.trim(),
            }
          : {}),
      });
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e, 'Could not save your changes'));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof form) => (value: string) => setForm({ ...form, [key]: value });

  return (
    <Screen>
      <Header title="Edit business" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      <Field label="BUSINESS NAME" value={form.businessName} onChangeText={set('businessName')} />
      <Text style={styles.section}>Settlement bank</Text>
      <NoticeBanner message="Bank details can't be changed while a payout is in progress. Every payout is still approved on your phone." />
      <Field label="BANK CODE" value={form.bankCode} onChangeText={set('bankCode')} autoCapitalize="none" />
      <Field label="ACCOUNT NUMBER" value={form.accountNumber} onChangeText={set('accountNumber')} keyboardType="number-pad" />
      <Field label="ACCOUNT NAME" value={form.accountName} onChangeText={set('accountName')} />
      <Button
        title="Save"
        variant="accent"
        loading={saving}
        disabled={(!nameChanged && !bankChanged) || (bankChanged && !bankComplete) || !form.businessName.trim()}
        onPress={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...type.heading, color: colors.text, marginTop: spacing.md, marginBottom: spacing.md },
});
