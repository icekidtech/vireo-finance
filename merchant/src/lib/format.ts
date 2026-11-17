/**
 * Money arrives from the API as decimal strings ("1500.00"). It is formatted
 * from the string, never through Number arithmetic, so display can't drift
 * from the ledger.
 */
export function formatMoney(amount: string | null | undefined, currency = 'NGN'): string {
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  if (amount == null || amount === '') return `${symbol}0.00`;
  const [whole = '0', fraction = ''] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${grouped}.${(fraction + '00').slice(0, 2)}`;
}

/** Whole-naira part with grouping, for hero numerals ("12,500"). */
export function splitMoney(amount: string | null | undefined): { whole: string; cents: string } {
  const [whole = '0', fraction = ''] = (amount ?? '0').split('.');
  return {
    whole: whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    cents: (fraction + '00').slice(0, 2),
  };
}

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  if (diff < minute) return 'Just now';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)}m ago`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Extracts a human-readable message from an axios error or plain Error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const e = error as { response?: { data?: { message?: string | string[] } }; message?: string };
  const message = e?.response?.data?.message;
  if (Array.isArray(message)) return message.join('. ');
  return message || e?.message || fallback;
}

/** Groups the integer part of an in-progress keypad amount ("12500." -> "12,500."). */
export function groupAmountInput(amount: string): string {
  if (amount === '') return '0';
  const [whole, ...rest] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest.join('')}` : grouped;
}
