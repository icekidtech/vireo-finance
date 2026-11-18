import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTransferDraftDto, BankLookupDto } from '../transfers/dto/transfers.dto';
import { OnboardMerchantDto, UpdateMerchantDto } from '../merchant/dto/merchant.dto';

const PAGA_OWN_BANK = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'; // not a strict RFC UUID, but a real Paga bank id
const ACCESS = 'e73d306e-843a-448b-9b7f-128549ff8945';

async function errors(cls: new () => object, plain: object) {
  return (await validate(plainToInstance(cls, plain))).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

describe('bank ids from Paga', () => {
  it.each([PAGA_OWN_BANK, ACCESS, ACCESS.toUpperCase()])('lookup accepts %s', async (bankCode) => {
    expect(await errors(BankLookupDto, { bankCode, accountNumber: '0123456789' })).toEqual([]);
  });

  it('lookup still rejects things that are not bank ids', async () => {
    for (const bankCode of ['058', 'not-a-uuid', '', ACCESS + 'x']) {
      expect(
        (await errors(BankLookupDto, { bankCode, accountNumber: '0123456789' })).length,
      ).toBeGreaterThan(0);
    }
  });

  it('a payment draft can carry a full bank id (36 characters)', async () => {
    const issues = await errors(CreateTransferDraftDto, {
      type: 'bank',
      amount: '100.00',
      idempotencyKey: 'abcdefgh1234',
      deviceId: ACCESS,
      bankCode: PAGA_OWN_BANK,
      accountNumber: '0123456789',
    });
    expect(issues).toEqual([]);
  });

  it('merchant onboarding and edits accept it too', async () => {
    expect(
      await errors(UpdateMerchantDto, {
        settlementBankCode: PAGA_OWN_BANK,
        settlementAccountNumber: '0123456789',
      }),
    ).toEqual([]);
    expect(
      await errors(OnboardMerchantDto, {
        businessName: 'Ada Kitchen',
        handle: 'ada_k',
        settlementBankCode: PAGA_OWN_BANK,
      }),
    ).toEqual([]);
  });
});
