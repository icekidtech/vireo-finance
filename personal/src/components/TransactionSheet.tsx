import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ActivityItem, Transfer } from '../types';
import { formatDateTime, formatMoney } from '../lib/format';
import ReceiptCard, { Pill } from './ReceiptCard';
import { BigMoney } from './ui';
import { colors, spacing, type } from '../theme';

export function activityLabel(kind: string): string {
  switch (kind) {
    case 'internal_transfer':
      return 'Transfer';
    case 'bank_transfer':
      return 'Bank transfer';
    case 'merchant_payment':
      return 'Merchant payment';
    case 'inbound_credit':
      return 'Deposit';
    case 'settlement':
      return 'Cash out';
    case 'fee':
      return 'Fee';
    default:
      return kind.replace(/_/g, ' ');
  }
}

type Props = {
  /** The transaction to show; null keeps the sheet closed. */
  item: ActivityItem | null;
  onClose: () => void;
  /** Optional: fetches the full transfer (fee, status, account) when the item has a transferId. */
  loadTransfer?: (transferId: string) => Promise<Transfer>;
};

const SHEET_STATUS: Record<string, string> = { completed: 'Completed', pending: 'Processing', processing: 'Processing', failed: 'Failed' };

/**
 * Transaction details as a popup: it rises from the bottom of the screen to the middle, over a
 * dimmed backdrop, and sinks back down when closed (tap outside or Close).
 */
export default function TransactionSheet({ item, onClose, loadTransfer }: Props) {
  const { height } = useWindowDimensions();
  const rise = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = in place
  const [shown, setShown] = useState<ActivityItem | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);

  // Open: remember the item (so the content stays while sinking) and animate in.
  useEffect(() => {
    if (!item) return;
    setShown(item);
    setTransfer(null);
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, damping: 18, stiffness: 160, mass: 0.9, useNativeDriver: true }).start();
    let cancelled = false;
    if (item.transferId && loadTransfer) {
      // Not every viewer may read the transfer (e.g. the person who was paid), so a failure just means less detail.
      loadTransfer(item.transferId)
        .then((t) => !cancelled && setTransfer(t))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [item, loadTransfer, rise]);

  const close = () => {
    Animated.timing(rise, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setShown(null);
      onClose();
    });
  };

  if (!shown) return null;
  const incoming = shown.direction === 'in';
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [height * 0.7, 0] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.backdrop, { opacity: rise }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close details" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.md }}>
            <ReceiptCard>
              <Pill tone={transfer?.status === 'failed' ? 'coral' : 'purple'}>
                {transfer ? (SHEET_STATUS[transfer.status] ?? transfer.status) : incoming ? 'Money received' : 'Payment sent'}
              </Pill>
              <Text style={styles.name} numberOfLines={2}>
                {shown.counterparty}
              </Text>
              <BigMoney amount={shown.amount} size="display" color={colors.white} />
              <View style={styles.pills}>
                <Pill>{incoming ? 'In' : 'Out'}</Pill>
                <Pill>{activityLabel(shown.type)}</Pill>
                {transfer ? <Pill>Fee {formatMoney(transfer.fee, transfer.currency)}</Pill> : null}
                {transfer?.recipientAccountNumber ? <Pill>Account {transfer.recipientAccountNumber}</Pill> : null}
                <Pill>{formatDateTime(shown.createdAt)}</Pill>
                {shown.reference ? <Pill>Ref {shown.reference.slice(0, 18)}</Pill> : null}
              </View>
              {transfer?.failureReason ? <Text style={styles.reason}>{transfer.failureReason}</Text> : null}
            </ReceiptCard>
          </ScrollView>
          <Pressable onPress={close} style={styles.closeBtn} accessibilityRole="button">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,22,16,0.78)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '86%' },
  name: { ...type.heading, color: colors.white, marginTop: spacing.lg, marginBottom: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  reason: { ...type.body, color: '#FFB4AC', marginTop: spacing.md },
  closeBtn: { alignSelf: 'center', backgroundColor: '#D6F047', borderRadius: 999, paddingHorizontal: 34, paddingVertical: 12, marginTop: spacing.sm },
  closeText: { color: '#0B2A22', fontSize: 16, fontWeight: '700' },
});
