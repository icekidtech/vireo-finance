import { presentActivityRow } from './ledger.service';

const base = {
  id: 'e1',
  amount: '200000',
  currency: 'NGN',
  reference: 'r',
  transferId: null,
  recipientName: null,
  initiatorName: null,
  merchantName: null,
  createdAt: '2026-11-18',
} as Record<string, string | null>;

describe('presentActivityRow', () => {
  it('shows who sent money in a transfer to the balance', () => {
    expect(
      presentActivityRow({
        ...base,
        direction: 'credit',
        type: 'internal_transfer',
        initiatorName: 'Idopise Udoh',
      }),
    ).toMatchObject({
      direction: 'in',
      amount: '2000.00',
      counterparty: 'Idopise Udoh',
    });
  });
  it('labels bank deposits, cash-outs and fees plainly', () => {
    expect(
      presentActivityRow({ ...base, direction: 'credit', type: 'inbound_credit' }).counterparty,
    ).toBe('Bank deposit');
    expect(presentActivityRow({ ...base, direction: 'debit', type: 'settlement' })).toMatchObject({
      direction: 'out',
      counterparty: 'Cash out to bank',
    });
    expect(presentActivityRow({ ...base, direction: 'debit', type: 'fee' }).counterparty).toBe(
      'Fee',
    );
  });
  it('names the payee on outgoing transfers', () => {
    expect(
      presentActivityRow({
        ...base,
        direction: 'debit',
        type: 'bank_transfer',
        recipientName: 'ADA OBI',
      }).counterparty,
    ).toBe('ADA OBI');
  });
});
