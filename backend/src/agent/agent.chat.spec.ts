import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AgentService, resolveBank } from './agent.service';

const DEVICE = '11111111-1111-4111-8111-111111111111';

function setup(opts: {
  enabled?: boolean;
  llmReplies: any[];
  banks?: { name: string; uuid: string }[];
}) {
  const sessions = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn(async () => ({ id: 'session-1', status: 'active', createdAt: new Date() })),
    findOne: jest.fn(async () => ({ id: 'session-1', userId: 'user-1' })),
  };
  const toolCalls = { create: jest.fn((v: unknown) => v), save: jest.fn(async (v: unknown) => v) };
  const transfers = {
    createDraft: jest.fn(async () => ({
      transfer: { id: 't-1', status: 'draft', amount: '500.00', fee: '0.00', recipientName: 'Ada' },
      challenge: { id: 'c-1', payloadHash: 'deadbeef' },
    })),
    list: jest.fn(async () => []),
  };
  const replies = [...opts.llmReplies];
  const llm = {
    enabled: opts.enabled ?? true,
    complete: jest.fn(async () => replies.shift()),
  };
  const service = new AgentService(
    sessions as any,
    toolCalls as any,
    {} as any,
    {} as any,
    {} as any,
    transfers as any,
    { listBanks: jest.fn(async () => opts.banks ?? []) } as any,
    llm as any,
  );
  return { service, llm, transfers };
}

const toolCall = (name: string, args: Record<string, unknown>) => ({
  id: 'call-1',
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
});

describe('AgentService.chat', () => {
  it('is unavailable when no model is configured', async () => {
    const { service } = setup({ enabled: false, llmReplies: [] });
    await expect(service.chat('user-1', { message: 'hi' })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns the assistant reply', async () => {
    const { service } = setup({ llmReplies: [{ content: 'Hello!', toolCalls: [] }] });
    const result = await service.chat('user-1', { message: 'hi', sessionId: 'session-1' });
    expect(result.reply).toBe('Hello!');
    expect(result.toolsExecuted).toEqual([]);
  });

  it("takes the signing device from the request, never from the model's arguments", async () => {
    const { service, transfers } = setup({
      llmReplies: [
        {
          content: null,
          toolCalls: [
            toolCall('create_transfer_draft', {
              amount: '500.00',
              recipientHandle: 'ada',
              deviceId: 'attacker-device',
              idempotencyKey: 'attacker-key',
            }),
          ],
        },
        { content: 'Drafted. Approve on your phone.', toolCalls: [] },
      ],
    });
    await service.chat('user-1', { message: 'send 500 to ada', deviceId: DEVICE });
    const dto = (transfers.createDraft.mock.calls as any[][])[0][1];
    expect(dto.deviceId).toBe(DEVICE);
    expect(dto.idempotencyKey).not.toBe('attacker-key');
  });

  it('hands the challenge to the app but hides it from the model', async () => {
    const { service, llm } = setup({
      llmReplies: [
        { content: null, toolCalls: [toolCall('create_transfer_draft', { amount: '500.00' })] },
        { content: 'Please approve on your phone.', toolCalls: [] },
      ],
    });
    const result = await service.chat('user-1', { message: 'send 500', deviceId: DEVICE });

    expect(result.drafts).toHaveLength(1);
    expect((result.drafts[0] as any).challenge.payloadHash).toBe('deadbeef');

    const secondCallMessages = (llm.complete.mock.calls as any[][])[1][0];
    const toolMessage = secondCallMessages.find((m: any) => m.role === 'tool');
    expect(toolMessage.content).not.toContain('deadbeef');
    expect(toolMessage.content).toContain('awaitingUserApproval');
  });

  it('refuses to draft a transfer when no signing device was provided', async () => {
    const { service, transfers } = setup({
      llmReplies: [
        { content: null, toolCalls: [toolCall('create_transfer_draft', { amount: '500.00' })] },
        { content: 'I need a device.', toolCalls: [] },
      ],
    });
    const result = await service.chat('user-1', { message: 'send 500' });
    expect(transfers.createDraft).not.toHaveBeenCalled();
    expect(result.drafts).toHaveLength(0);
  });

  it('rejects tools outside the allow-list', async () => {
    const { service, llm } = setup({
      llmReplies: [
        { content: null, toolCalls: [toolCall('drop_database', {})] },
        { content: 'Sorry.', toolCalls: [] },
      ],
    });
    await service.chat('user-1', { message: 'x', sessionId: 'session-1' });
    const toolMessage = (llm.complete.mock.calls as any[][])[1][0].find(
      (m: any) => m.role === 'tool',
    );
    expect(toolMessage.content).toContain('Unknown tool');
  });

  it("rejects another user's session", async () => {
    const { service } = setup({ llmReplies: [] });
    (service as any).sessions.findOne = jest.fn(async () => null);
    await expect(
      service.chat('user-1', { message: 'hi', sessionId: 'someone-elses' }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('bank transfers through the assistant', () => {
  const banks = [
    { name: 'Access Bank', uuid: 'u-access' },
    { name: 'Access Bank Ghana', uuid: 'u-ghana' },
    { name: 'Zenith Bank', uuid: 'u-zenith' },
    { name: 'First Bank', uuid: 'u-fb1' },
    { name: 'First Bank of Nigeria', uuid: 'u-fb2' },
  ];

  it('drafts a bank transfer using the bank id from the server list, not from the model', async () => {
    const { service, transfers } = setup({
      banks,
      llmReplies: [
        {
          content: null,
          toolCalls: [
            toolCall('create_bank_transfer_draft', {
              amount: '2000.00',
              bankName: 'zenith bank',
              accountNumber: '0123456789',
              bankCode: 'attacker-bank',
              deviceId: 'attacker-device',
            }),
          ],
        },
        { content: 'Drafted.', toolCalls: [] },
      ],
    });
    const result = await service.chat('user-1', {
      message: 'send 2k to zenith 0123456789',
      deviceId: DEVICE,
    });
    const dto = (transfers.createDraft.mock.calls as any[][])[0][1];
    expect(dto).toMatchObject({
      type: 'bank',
      bankCode: 'u-zenith',
      accountNumber: '0123456789',
      deviceId: DEVICE,
      amount: '2000.00',
    });
    expect((transfers.createDraft.mock.calls as any[][])[0][2]).toEqual({ channel: 'agent' });
    expect(result.drafts).toHaveLength(1);
  });

  it('refuses a malformed account number and never reaches the transfer service', async () => {
    const { service, transfers } = setup({
      banks,
      llmReplies: [
        {
          content: null,
          toolCalls: [
            toolCall('create_bank_transfer_draft', {
              amount: '500',
              bankName: 'Zenith Bank',
              accountNumber: '12345',
            }),
          ],
        },
        { content: 'That account number looks wrong.', toolCalls: [] },
      ],
    });
    await service.chat('user-1', { message: 'x', deviceId: DEVICE });
    expect(transfers.createDraft).not.toHaveBeenCalled();
  });

  it('needs a signing device, like any draft', async () => {
    const { service, transfers } = setup({
      banks,
      llmReplies: [
        {
          content: null,
          toolCalls: [
            toolCall('create_bank_transfer_draft', {
              amount: '500',
              bankName: 'Zenith Bank',
              accountNumber: '0123456789',
            }),
          ],
        },
        { content: 'No device.', toolCalls: [] },
      ],
    });
    await service.chat('user-1', { message: 'x' });
    expect(transfers.createDraft).not.toHaveBeenCalled();
  });

  describe('resolveBank', () => {
    it('prefers an exact name, ignoring case and punctuation', () => {
      expect(resolveBank('ACCESS bank', banks).uuid).toBe('u-access');
      expect(resolveBank('First Bank', banks).uuid).toBe('u-fb1');
    });
    it('accepts a unique partial name', () => {
      expect(resolveBank('zenith', banks).uuid).toBe('u-zenith');
    });
    it('asks which bank when several match, and when none do', () => {
      expect(() => resolveBank('first', banks)).toThrow(/Several banks match/);
      expect(() => resolveBank('nonexistent', banks)).toThrow(/No supported bank/);
    });
  });
});
