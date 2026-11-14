export const MINOR_UNITS_PER_MAJOR = 100n;

const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;

export class MoneyError extends Error {}

/**
 * Parses a human-readable amount ("20", "20.5", "20000.00") into minor units
 * (kobo). Throws on anything malformed so callers never silently round money.
 */
export function parseAmountToMinor(value: string): bigint {
  const trimmed = value.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    throw new MoneyError(`Invalid amount: ${value}`);
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const paddedFraction = (fraction + '00').slice(0, 2);
  return BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(paddedFraction);
}

export function formatMinor(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const absolute = minor < 0n ? -minor : minor;
  const whole = absolute / MINOR_UNITS_PER_MAJOR;
  const fraction = (absolute % MINOR_UNITS_PER_MAJOR).toString().padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function assertPositive(amount: bigint): void {
  if (amount <= 0n) {
    throw new MoneyError('Amount must be greater than zero');
  }
}
