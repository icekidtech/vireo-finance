import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Button, ErrorBanner, Field, Header, Loading, NoticeBanner, Screen } from '../components/ui';
import BankAccountFields, { type BankAccountValue } from '../components/BankAccountFields';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'EditBusiness'>;

export default function EditBusinessScreen({ navigation }: Props) {
  const { data: merchant, loading } = useLoad(() => api.getMerchantProfile(), 'Could not load your business');
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccountValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the name once the profile arrives.
  if (merchant && businessName === null) setBusinessName(merchant.businessName);
  if (loading || businessName === null || !merchant) return <Loading />;

  const nameChanged = businessName.trim() !== merchant.businessName;
  const bankChanged = !!bankAccount?.changed;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateMerchant({
        ...(nameChanged ? { businessName: businessName.trim() } : {}),
        // The server verifies the account and records the holder's name itself.
        ...(bankChanged && bankAccount?.verified
          ? { settlementBankCode: bankAccount.bankCode!, settlementAccountNumber: bankAccount.accountNumber }
          : {}),
      });
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e, 'Could not save your changes'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header title="Edit business" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      <Field label="BUSINESS NAME" value={businessName} onChangeText={setBusinessName} />
      <Text style={styles.section}>Settlement bank</Text>
      <NoticeBanner message="Bank details can't be changed while a payout is in progress. Every payout is still approved on your phone." />
      <BankAccountFields
        initial={{
          bankCode: merchant.settlementBankCode,
          accountNumber: merchant.settlementAccountNumber,
          accountName: merchant.settlementAccountName,
        }}
        onChange={setBankAccount}
      />
      <Button
        title="Save"
        variant="accent"
        loading={saving}
        disabled={(!nameChanged && !bankChanged) || (bankChanged && !bankAccount?.verified) || !businessName.trim()}
        onPress={save}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...type.heading, color: colors.text, marginTop: spacing.md, marginBottom: spacing.md },
});
