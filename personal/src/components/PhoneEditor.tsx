import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { errorMessage, isNigerianPhone } from '../lib/format';
import { Button, ErrorBanner, Field, ListRow, NoticeBanner } from './ui';
import { colors, spacing, type } from '../theme';

/**
 * The phone number on the account, with a way to correct it. The number is used to open the
 * payment account, and Paga refuses one with a missing digit, so an account saved with a bad
 * number shows a warning here and can fix it without contacting anyone.
 */
export default function PhoneEditor() {
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = user?.phone ? isNigerianPhone(user.phone) : false;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      updateUser(await api.updatePhone(phone.trim()));
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e, 'Could not update your phone number'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      {!valid && user ? (
        <NoticeBanner message="The phone number on your account doesn't look right, so we can't open your account number yet. Update it below." />
      ) : null}
      <ListRow
        title="Phone"
        subtitle={editing ? undefined : 'Used for your account number. We never text you a code.'}
        trailing={editing ? undefined : `${user?.phone ?? '—'}  ·  Change`}
        onPress={editing ? undefined : () => { setPhone(''); setError(null); setEditing(true); }}
      />
      {editing ? (
        <View style={styles.form}>
          <ErrorBanner message={error} />
          <Field
            label="NEW PHONE NUMBER"
            placeholder="08012345678"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoComplete="tel"
            hint={phone.trim() && !isNigerianPhone(phone) ? 'Enter a valid Nigerian number, e.g. 08012345678 (11 digits).' : undefined}
          />
          <Button title="Save" variant="accent" loading={saving} disabled={!isNigerianPhone(phone)} onPress={save} />
          <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { paddingTop: spacing.md, gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
});
