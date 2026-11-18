/**
 * A bank id as Paga issues it: UUID-shaped (8-4-4-4-12 hex). Deliberately NOT the strict
 * RFC check (`@IsUUID()`), which rejects some of Paga's own ids (for example Paga's own bank,
 * AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA).
 */
export const BANK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BANK_ID_MESSAGE = 'bankCode must be a bank id from the bank list';
