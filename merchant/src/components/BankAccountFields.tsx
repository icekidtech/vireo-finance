import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api } from '../api';
import { errorMessage } from '../lib/format';
import BankPicker, { type Bank } from './BankPicker';
import { Button, ErrorBanner, Field } from './ui';
import { colors, radius, spacing, type } from '../theme';

export type BankAccountValue = {
  /** Paga bank id (never typed by the user). */
  bankCode: string | null;
  accountNumber: string;
  /** Resolved by the bank; null until verified. */
  accountName: string | null;
  /** True when the details differ from `initial`. */
  changed: boolean;
  /** True when a bank is chosen and the account name has been verified. */
  verified: boolean;
};

type Props = {
  initial?: { bankCode: string | null; accountNumber: string | null; accountName: string | null };
  onChange: (value: BankAccountValue) => void;
};

/**
 * Bank picker + account number + read-only account name. The name is fetched
 * from the bank once a bank and a 10-digit number are set; it cannot be typed.
 */
export default function BankAccountFields({ initial, onChange }: Props) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? '');
  const [accountName, setAccountName] = useState<string | null>(initial?.accountName ?? null);
  const [resolving, setResolving] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const seeded = useRef(false);

  // Load the supported banks once; retry is manual so a failure can't loop.
  useEffect(() => {
    let cancelled = false;
    setBanksLoading(true);
    setBanksError(null);
    api
      .listBanks()
      .then((list) => {
        if (cancelled) return;
        setBanks(list);
        // Pre-select the saved bank once, if it is in the list.
        if (!seeded.current && initial?.bankCode) {
          seeded.current = true;
          setBank(list.find((b) => b.code === initial.bankCode) ?? null);
        }
      })
      .catch((e) => !cancelled && setBanksError(errorMessage(e, 'Could not load the list of banks')))
      .finally(() => !cancelled && setBanksLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const unchanged =
    !!initial?.bankCode && bank?.code === initial.bankCode && accountNumber === (initial.accountNumber ?? '');

  // Resolve the account holder's name whenever bank + number are complete.
  useEffect(() => {
    setLookupError(null);
    if (unchanged) return setAccountName(initial?.accountName ?? null);
    setAccountName(null);
    if (!bank || !/^\d{10}$/.test(accountNumber)) return;
    let cancelled = false;
    setResolving(true);
    api
      .lookupBankAccount({ bankCode: bank.code, accountNumber })
      .then((r) => !cancelled && setAccountName(r.accountName))
      .catch((e) => !cancelled && setLookupError(errorMessage(e, 'Could not verify this account')))
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, accountNumber]);

  useEffect(() => {
    onChange({
      bankCode: bank?.code ?? null,
      accountNumber,
      accountName,
      changed:
        (bank?.code ?? null) !== (initial?.bankCode ?? null) || accountNumber !== (initial?.accountNumber ?? ''),
      verified: !!bank && !!accountName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, accountNumber, accountName]);

  return (
    <View>
      <ErrorBanner message={banksError ?? lookupError} />
      <BankPicker banks={banks} value={bank} onChange={(b) => setBank(b)} loading={banksLoading} />
      {banksError && !banksLoading ? (
        <Button title="Retry loading banks" variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
      ) : null}
      <Field
        label="ACCOUNT NUMBER"
        placeholder="10-digit account number"
        value={accountNumber}
        onChangeText={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
        keyboardType="number-pad"
        maxLength={10}
      />
      <Text style={styles.label}>ACCOUNT NAME</Text>
      <View style={styles.readonly}>
        <Text style={[styles.readonlyText, !accountName && { color: colors.textFaint }]}>
          {accountName ?? (resolving ? 'Verifying account…' : 'Appears after you pick a bank and enter the number')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, color: colors.textMuted, marginBottom: spacing.sm },
  readonly: {
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 58,
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  readonlyText: { ...type.bodyStrong, color: colors.text },
});
