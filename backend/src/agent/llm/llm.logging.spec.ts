import { BadGatewayException, Logger } from '@nestjs/common';
import { LlmService } from './llm.service';

const KEY = 'sk-test-SUPERSECRET';

function make(payloads = false) {
  const config = {
    get: (k: string) =>
      ({ 'openai.apiKey': KEY, 'openai.model': 'gpt-test', 'logging.llmPayloads': payloads })[k],
  };
  return new LlmService(config as never);
}

function capture() {
  const lines: string[] = [];
  const spies = (['log', 'error', 'warn'] as const).map((l) =>
    jest.spyOn(Logger.prototype, l).mockImplementation(((msg: unknown) => {
      lines.push(String(msg));
    }) as never),
  );
  return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
}

const messages = [
  { role: 'system' as const, content: 'sys' },
  { role: 'user' as const, content: 'what is my balance? account 0123456789' },
];

describe('LlmService logging', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('logs request and response summaries without the API key or prompt text', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: 'Your balance is 5,000 naira.', tool_calls: [] },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
          }),
          { status: 200 },
        ),
    ) as never;
    const cap = capture();
    await make().complete(messages, []);
    cap.restore();
    const all = cap.lines.join('\n');
    expect(all).toMatch(/OpenAI request model=gpt-test messages=2/);
    expect(all).toMatch(/OpenAI response status=200 \d+ms finish=stop tokens=20/);
    expect(all).toContain('Your balance is 5,000 naira.');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('0123456789'); // the prompt is not logged by default
  });

  it('logs full payloads only when enabled, still without the API key', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
        }),
    ) as never;
    const cap = capture();
    await make(true).complete(messages, []);
    cap.restore();
    const all = cap.lines.join('\n');
    expect(all).toContain('what is my balance');
    expect(all).not.toContain(KEY);
  });

  it('logs failures with status and error type, not the provider message', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              type: 'invalid_request_error',
              code: 'invalid_api_key',
              message: `Incorrect API key provided: ${KEY}`,
            },
          }),
          { status: 401 },
        ),
    ) as never;
    const cap = capture();
    await expect(make().complete(messages, [])).rejects.toThrow(BadGatewayException);
    cap.restore();
    const all = cap.lines.join('\n');
    expect(all).toContain('OpenAI response status=401');
    expect(all).toContain('code=invalid_api_key');
    expect(all).not.toContain(KEY);
  });

  it('logs network failures with timing', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as never;
    const cap = capture();
    await expect(make().complete(messages, [])).rejects.toThrow(BadGatewayException);
    cap.restore();
    expect(cap.lines.join('\n')).toMatch(/OpenAI request failed after \d+ms: Error: ECONNRESET/);
  });
});
