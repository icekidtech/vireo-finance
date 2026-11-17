import { PagaService } from './paga.service';

const config = {
  get: jest.fn(
    (k: string) =>
      ({
        'paga.businessBaseUrl': 'https://paga.test/business',
        'paga.collectBaseUrl': 'https://paga.test/collect',
        'paga.apiKey': 'pub',
        'paga.apiSecret': 'sec',
        'paga.hashKey': 'hk',
      })[k],
  ),
};

describe('PagaService.listBanks', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the bank list from the Business API, which the other Business calls rely on', async () => {
    const f = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          responseCode: 0,
          banks: [{ name: 'Access Bank', uuid: 'u1', sortCode: '044' }, { name: 'No Id Bank' }],
        }),
    } as Response);
    const service = new PagaService(config as never);
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    await expect(service.listBanks()).resolves.toEqual([
      { name: 'Access Bank', uuid: 'u1', sortCode: '044', ussdCode: undefined },
    ]);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://paga.test/business/getBanks');
    const headers = init.headers as Record<string, string>;
    expect(headers.principal).toBe('pub');
    expect(headers.credentials).toBe('sec');
    expect(headers.hash).toHaveLength(128);
  });
});

describe('PagaService.validateBankAccount', () => {
  afterEach(() => jest.restoreAllMocks());
  const input = {
    bankCode: '11111111-1111-4111-8111-111111111111',
    accountNumber: '0123456789',
    amountMinor: 100n,
    reference: 'r1',
  };

  function serviceReplying(body: unknown) {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    } as Response);
    const service = new PagaService(config as never);
    for (const m of ['log', 'error'])
      jest.spyOn((service as any).logger, m).mockImplementation(() => undefined);
    return service;
  }

  it('returns the holder name from the bank', async () => {
    const service = serviceReplying({
      responseCode: 0,
      destinationAccountHolderNameAtBank: 'ADA OBI',
    });
    await expect(service.validateBankAccount(input)).resolves.toMatchObject({
      accountName: 'ADA OBI',
    });
  });

  it('treats our own empty Paga wallet as a service problem, not a user error, and hides Paga’s text', async () => {
    const service = serviceReplying({ responseCode: 139, message: 'insufficient balance ₦54.75' });
    const err = await service.validateBankAccount(input).catch((e: Error) => e);
    expect((err as unknown as { getStatus(): number }).getStatus()).toBe(502);
  });

  it('passes a genuine bad-account answer through as a 400', async () => {
    const service = serviceReplying({ responseCode: 1, message: 'Invalid account number' });
    const err = await service.validateBankAccount(input).catch((e: Error) => e);
    expect((err as unknown as { getStatus(): number }).getStatus()).toBe(400);
  });
});
