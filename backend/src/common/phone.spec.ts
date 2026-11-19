import { NG_PHONE_PATTERN, normalizeNigerianPhone } from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    ['08163790777', '+2348163790777'],
    ['8163790777', '+2348163790777'],
    ['2348163790777', '+2348163790777'],
    ['+2348163790777', '+2348163790777'],
    ['0816 379 0777', '+2348163790777'],
    ['(0816) 379-0777', '+2348163790777'],
    ['07044123424', '+2347044123424'],
    ['09012345678', '+2349012345678'],
  ])('accepts %p', (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  // The 10-digit number with a leading zero is the real typo that made Paga answer
  // "'phone number' has an invalid value" and broke deposit-account creation.
  it.each([
    '0816379077', // one digit short, still starting with 0
    '081637907777', // one digit too many
    '+23481637907', // short international number
    '12345678901',
    '0601234567',
    '+14155550123', // not Nigerian
    '',
    '   ',
    'phone',
  ])('refuses %p', (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });

  it('handles missing values', () => {
    expect(normalizeNigerianPhone(null)).toBeNull();
    expect(normalizeNigerianPhone(undefined)).toBeNull();
  });

  it('agrees with the pattern used to validate sign-up', () => {
    expect(NG_PHONE_PATTERN.test('08163790777')).toBe(true);
    expect(NG_PHONE_PATTERN.test('0816379077')).toBe(false);
  });
});
