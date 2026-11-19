/**
 * Nigerian mobile numbers, the only kind Paga accepts for an account. Accepted forms:
 * 08012345678, 8012345678, 2348012345678 and +2348012345678 (mobile prefixes 70, 80, 81, 90, 91).
 * Anything with a missing or extra digit is refused instead of being sent to Paga, which answers
 * `'phone number' has an invalid value`.
 */
export const NG_PHONE_PATTERN = /^(?:\+?234|0)?[789][01]\d{8}$/;

/** The number in one canonical form (+234XXXXXXXXXX), or null when it is not a valid Nigerian mobile number. */
export function normalizeNigerianPhone(input: string | null | undefined): string | null {
  const compact = (input ?? '').trim().replace(/[\s()-]/g, '');
  const match = /^(?:\+?234|0)?([789][01]\d{8})$/.exec(compact);
  return match ? `+234${match[1]}` : null;
}

/**
 * Every way the same number may already be stored: older accounts kept the number exactly as it
 * was typed (08012345678, 8012345678, 2348012345678), newer ones use +2348012345678. Used to
 * stop one number from being registered twice under different spellings.
 */
export function phoneVariants(canonical: string): string[] {
  const national = canonical.replace(/^\+234/, '');
  return [canonical, `0${national}`, national, `234${national}`];
}
