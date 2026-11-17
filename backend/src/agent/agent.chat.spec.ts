import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AgentService } from './agent.service';

const DEVICE = '11111111-1111-4111-8111-111111111111';

function setup(opts: { enabled?: boolean; llmReplies: any[] }) {
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
    {} as any,
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
