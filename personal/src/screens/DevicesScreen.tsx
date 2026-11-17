import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { api } from '../api';
import { clearDeviceRegistration, getDeviceId } from '../lib/deviceKey';
import { errorMessage, formatDateTime } from '../lib/format';
import { useLoad } from '../lib/useLoad';
import type { RootStackParamList } from '../navigation';
import { Avatar, Button, Empty, ErrorBanner, Header, ListRow, Loading, Screen, StatusPill } from '../components/ui';


type Props = StackScreenProps<RootStackParamList, 'Devices'>;

export default function DevicesScreen({ navigation }: Props) {
  const { data, loading, error, refreshing, refresh } = useLoad(() => api.listDevices(), 'Could not load devices');
  const [localId, setLocalId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void getDeviceId().then(setLocalId);
  }, []);

  const revoke = (id: string) =>
    Alert.alert('Revoke this device?', 'It will no longer be able to approve payments.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.revokeDevice(id);
            // A revoked local key is dead weight; a fresh one registers on next approval.
            if (id === localId) {
              await clearDeviceRegistration();
              setLocalId(null);
            }
            refresh();
          } catch (e) {
            setActionError(errorMessage(e, 'Could not revoke the device'));
          }
        },
      },
    ]);

  if (loading && !data) return <Loading />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Signing devices" onBack={() => navigation.goBack()} />
      <ErrorBanner message={error ?? actionError} />
      {data && data.length > 0 ? (
        data.map((d) => (
          <ListRow
            key={d.id}
            leading={<Avatar label={d.platform} />}
            title={`${d.platform === 'ios' ? 'iPhone' : 'Android'}${d.id === localId ? ' (this phone)' : ''}`}
            subtitle={`${d.algorithm} · added ${formatDateTime(d.createdAt)}`}
            trailing={
              d.status === 'active' ? (
                <Button title="Revoke" variant="danger" small onPress={() => revoke(d.id)} />
              ) : (
                <StatusPill status="cancelled" />
              )
            }
          />
        ))
      ) : (
        <Empty title="No devices yet" body="Your phone is registered the first time you approve a payout." />
      )}
    </Screen>
  );
}
