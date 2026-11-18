import { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { canCopy, copyText } from '../lib/clipboard';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import AccountCard from '../components/AccountCard';
import InboxBanner from '../components/InboxBanner';
import { Button, Card, ErrorBanner, Header, Loading, NoticeBanner, Screen } from '../components/ui';
import { colors, spacing, type } from '../theme';

type Props = StackScreenProps<RootStackParamList, 'Receive'>;

/** The two ways to get paid: a bank transfer to the merchant's own account number, or a QR payment request. */
export default function ReceiveScreen({ navigation }: Props) {
  const { data, loading, error, refresh } = useLoad(
    () => api.getDepositAccount(),
    'Could not get your account number',
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data) return;
    if (await copyText(data.accountNumber)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Screen>
      <Header title="Receive money" onBack={() => navigation.goBack()} />
      <InboxBanner />

      <Text style={styles.section}>Bank transfer</Text>
      <Text style={styles.lead}>
        Customers can transfer to this account number from any bank app. The money lands in your Vireo balance.
      </Text>
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <AccountCard
          label="Account number"
          number={data.accountNumber}
          leftLabel="Bank"
          leftValue={data.bankName}
          rightLabel="Account name"
          rightValue={data.accountName}
          buttonTitle={copied ? 'Copied' : canCopy ? 'Copy' : 'Share'}
          onPress={copy}
        />
      ) : (
        <View>
          <ErrorBanner message={error} />
          {error?.includes('Verify your identity') ? (
            <Button title="Verify your identity" variant="accent" onPress={() => navigation.navigate('Verify')} />
          ) : (
            <Button title="Try again" variant="secondary" onPress={refresh} />
          )}
        </View>
      )}
      <NoticeBanner message="Transfers can take a few minutes to show. Use a payment request below to see payment confirmed instantly." />

      <Text style={[styles.section, { marginTop: spacing.xl }]}>QR payment request</Text>
      <Text style={styles.lead}>Enter an amount and show a QR code. The customer scans it in the Vireo app.</Text>
      <Button title="Create payment request" variant="accent" onPress={() => navigation.replace('Tabs', { screen: 'Charge' })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...type.heading, color: colors.text, marginTop: spacing.md },
  lead: { ...type.body, color: colors.textMuted, marginVertical: spacing.md },
  label: { ...type.label, color: colors.textMuted, marginTop: spacing.md },
  value: { ...type.bodyStrong, color: colors.text, marginTop: spacing.xs },
  number: { ...type.title, letterSpacing: 1 },
});
