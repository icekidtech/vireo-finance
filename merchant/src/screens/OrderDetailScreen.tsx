import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../api';
import { errorMessage, formatDateTime, formatMoney } from '../lib/format';
import type { MerchantOrder } from '../types';
import type { RootStackParamList } from '../navigation';
import {
  BigMoney,
  Button,
  Card,
  ErrorBanner,
  Header,
  ListRow,
  Loading,
  Screen,
  StatusPill,
} from '../components/ui';
import { colors, spacing, type } from '../theme';
import { showAlert } from '../lib/dialog';

type Props = StackScreenProps<RootStackParamList, 'OrderDetail'>;

const POLL_INTERVAL_MS = 3000;

export default function OrderDetailScreen({ navigation, route }: Props) {
  const { reference } = route.params;
  const [order, setOrder] = useState<MerchantOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setOrder(await api.getOrder(reference));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load this order'));
    }
  }, [reference]);

  useEffect(() => {
    void load();
  }, [load]);

  const expired = order?.expiresAt ? new Date(order.expiresAt).getTime() <= now : false;
  const waiting = order?.status === 'open' && !expired;

  // Poll until the customer's payment commits (or the order dies). A transient
  // lookup failure must not kill the loop, so errors are swallowed per tick.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        setOrder(await api.getOrder(reference));
      } catch {
        /* retry on next tick */
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [waiting, reference]);

  const cancel = () => {
    showAlert('Cancel this request?', 'The customer will no longer be able to pay it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            setOrder(await api.cancelOrder(reference));
          } catch (e) {
            setError(errorMessage(e, 'Could not cancel the order'));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (!order && !error) return <Loading />;

  const paid = order?.status === 'paid';
  const secondsLeft = order?.expiresAt
    ? Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - now) / 1000))
    : null;

  return (
    <Screen background={paid ? colors.accent : colors.bg}>
      <Header title={paid ? '' : 'Payment request'} onBack={() => navigation.goBack()} />
      <ErrorBanner message={error} />
      {order && (
        <>
          {paid ? (
            <View style={styles.paid}>
              <View style={styles.tick}>
                <Text style={styles.tickText}>✓</Text>
              </View>
              <Text style={styles.paidTitle}>Payment received</Text>
              <BigMoney amount={order.amount} color={colors.black} />
            </View>
          ) : (
            <View style={styles.center}>
              <BigMoney amount={order.amount} size="display" />
              {order.note ? <Text style={styles.note}>{order.note}</Text> : null}
              {waiting ? (
                <>
                  <View style={styles.qrFrame}>
                    <QRCode value={order.qrPayload} size={230} />
                  </View>
                  <Text style={styles.scan}>Ask the customer to scan with Vireo</Text>
                  <Text style={styles.timer}>
                    Waiting for payment
                    {secondsLeft != null
                      ? ` · expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                      : ''}
                  </Text>
                </>
              ) : (
                <View style={{ marginTop: spacing.xl }}>
                  <StatusPill status={expired && order.status === 'open' ? 'expired' : order.status} />
                </View>
              )}
            </View>
          )}

          <Card style={{ marginTop: spacing.xl, backgroundColor: paid ? 'rgba(255,255,255,0.35)' : colors.surface }}>
            <ListRow title="Reference" trailing={order.reference} />
            <ListRow title="Created" trailing={formatDateTime(order.createdAt)} />
            <ListRow title="Amount" trailing={formatMoney(order.amount, order.currency)} />
            <ListRow title="Status" trailing={<StatusPill status={expired && order.status === 'open' ? 'expired' : order.status} />} />
          </Card>

          {waiting && (
            <Button
              title="Customer pays with face"
              variant="secondary"
              onPress={() => navigation.navigate('BiometricPayment', { orderReference: order.reference, amount: order.amount })}
              style={{ marginTop: spacing.md }}
            />
          )}
          {waiting && (
            <Button
              title="Cancel request"
              variant="danger"
              loading={busy}
              onPress={cancel}
              style={{ marginTop: spacing.md }}
            />
          )}
          {!waiting && !paid && (
            <Button
              title="New charge"
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate('Tabs', { screen: 'Charge' })}
            />
          )}
          {paid && (
            <Button
              title="Done"
              style={{ marginTop: spacing.md }}
              onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', marginTop: spacing.lg },
  note: { ...type.body, color: colors.textMuted, marginTop: spacing.sm },
  qrFrame: {
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.black,
    backgroundColor: colors.white,
  },
  scan: { ...type.bodyStrong, marginTop: spacing.xl, color: colors.text },
  timer: { ...type.caption, marginTop: spacing.xs, color: colors.textMuted },
  paid: { alignItems: 'center', marginTop: spacing.xxl },
  tick: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  tickText: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  paidTitle: { ...type.heading, color: colors.black, marginBottom: spacing.sm },
});
