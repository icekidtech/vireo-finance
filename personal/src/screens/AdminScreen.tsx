import { useState } from 'react';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { errorMessage, formatRelative } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Avatar, Button, Empty, ErrorBanner, Header, ListRow, Loading, Screen, SegmentedControl, StatusPill } from '../components/ui';
import { View } from 'react-native';
import { spacing } from '../theme';
import { showAlert } from '../lib/dialog';

type Props = StackScreenProps<RootStackParamList, 'Admin'>;
type Tab = 'kyc' | 'kyb';

/** Staff-only review queues (the API enforces the admin role). */
export default function AdminScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('kyc');
  const kyc = useLoad(() => api.listPendingKyc(), 'Could not load KYC queue');
  const merchants = useLoad(() => api.listMerchants(), 'Could not load merchants');
  const [actionError, setActionError] = useState<string | null>(null);
  const active = tab === 'kyc' ? kyc : merchants;

  const run = async (fn: () => Promise<unknown>, refresh: () => void) => {
    setActionError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setActionError(errorMessage(e, 'Action failed'));
    }
  };

  const reviewKyc = (id: string, provider: string) =>
    showAlert(`Review ${provider} submission`, 'Approving sets the user\'s tier. Rejecting suspends the user.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve tier 1', onPress: () => run(() => api.verifyKyc(id, 'verified', '1'), kyc.refresh) },
      { text: 'Approve tier 2', onPress: () => run(() => api.verifyKyc(id, 'verified', '2'), kyc.refresh) },
      {
        text: 'Reject & suspend',
        style: 'destructive',
        onPress: () => run(() => api.verifyKyc(id, 'rejected', undefined, 'Rejected by staff'), kyc.refresh),
      },
    ]);

  const reviewKyb = (id: string, name: string) =>
    showAlert(`Review ${name}`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Verify', onPress: () => run(() => api.verifyKyb(id, 'verified'), merchants.refresh) },
      { text: 'Reject', style: 'destructive', onPress: () => run(() => api.verifyKyb(id, 'rejected'), merchants.refresh) },
    ]);

  const reviewRegistration = (id: string, name: string, cac: string | null) =>
    showAlert(
      `Review ${name}`,
      `CAC number ${cac ?? '—'}. Confirm the business and its status on the CAC public search before verifying.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify registration', onPress: () => run(() => api.reviewRegistration(id, 'verified'), merchants.refresh) },
        { text: 'Reject', style: 'destructive', onPress: () => run(() => api.reviewRegistration(id, 'rejected'), merchants.refresh) },
      ],
    );

  return (
    <Screen refreshing={active.refreshing} onRefresh={active.refresh}>
      <Header title="Review queue" onBack={() => navigation.goBack()} />
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { key: 'kyc', label: 'Identity' },
          { key: 'kyb', label: 'Businesses' },
        ]}
      />
      <View style={{ height: spacing.lg }} />
      <ErrorBanner message={active.error ?? actionError} />
      {active.loading && !active.data ? (
        <Loading />
      ) : tab === 'kyc' ? (
        kyc.data && kyc.data.length > 0 ? (
          kyc.data.map((r) => (
            <ListRow
              key={r.id}
              leading={<Avatar label={r.provider} />}
              title={r.provider}
              subtitle={`user ${r.userId.slice(0, 8)} · ${formatRelative(r.createdAt)}`}
              trailing={<Button title="Review" small variant="secondary" onPress={() => reviewKyc(r.id, r.provider)} />}
            />
          ))
        ) : (
          <Empty title="Queue is clear" body="No pending identity submissions." />
        )
      ) : merchants.data && merchants.data.length > 0 ? (
        merchants.data.map((m) => (
          <ListRow
            key={m.id}
            leading={<Avatar label={m.businessName} />}
            title={m.businessName}
            subtitle={`$${m.handle} · ${formatRelative(m.createdAt)}`}
            trailing={<StatusPill status={m.kybStatus} />}
            trailingSub={
              m.kybStatus === 'pending' ? (
                <Button title="Review" small variant="secondary" onPress={() => reviewKyb(m.id, m.businessName)} />
              ) : m.registrationStatus === 'pending' ? (
                <Button title="Review CAC" small variant="secondary" onPress={() => reviewRegistration(m.id, m.businessName, m.cacNumber ?? null)} />
              ) : undefined
            }
          />
        ))
      ) : (
        <Empty title="No merchants yet" />
      )}
    </Screen>
  );
}
