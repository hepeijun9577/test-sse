import type { Response } from 'express';
import { AgentService } from './agent.service';
import type { ChatCompletion, DeepSeekProvider } from './llm/deepseek.provider';
import { CalculatorTool } from './tools/calculator.tool';
import { ToolRegistry } from './tools/tool.registry';

describe('AgentService tool calling', () => {
  it('executes calculator and sends its result back to the model', async () => {
    const completions: ChatCompletion[] = [
      {
        content: null,
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: JSON.stringify({ expression: '12 * 3' }),
            },
          },
        ],
        assistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'calculator',
                arguments: JSON.stringify({ expression: '12 * 3' }),
              },
            },
          ],
        },
      },
      {
        content: '结果是 36。',
        toolCalls: [],
        assistantMessage: { role: 'assistant', content: '结果是 36。' },
      },
    ];
    const receivedMessages: unknown[][] = [];
    const provider = {
      completeChat: async (messages: unknown[]) => {
        receivedMessages.push(messages);
        return completions.shift() as ChatCompletion;
      },
    } as unknown as DeepSeekProvider;
    const service = new AgentService(
      provider,
      new ToolRegistry(new CalculatorTool()),
    );
    const events: string[] = [];
    const response = {
      writableEnded: false,
      on: () => response,
      off: () => response,
      write: (event: string) => events.push(event),
      end: () => undefined,
    } as unknown as Response;

    await service.streamResponse('计算 12 * 3', response);

    expect(receivedMessages[1]).toEqual([
      { role: 'user', content: '计算 12 * 3' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: JSON.stringify({ expression: '12 * 3' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({ expression: '12 * 3', result: 36 }),
        tool_call_id: 'call-1',
      },
    ]);
    expect(events.join('')).toContain('"type":"tool_started"');
    expect(events.join('')).toContain('"type":"tool_result"');
    expect(events.join('')).toContain('结果是 36。');
  });

  it('stops a repeated tool loop at the configured maximum steps', async () => {
    const previousMaxSteps = process.env.AGENT_MAX_STEPS;
    process.env.AGENT_MAX_STEPS = '2';
    const repeatedCompletion: ChatCompletion = {
      content: null,
      toolCalls: [
        {
          id: 'loop-call',
          type: 'function',
          function: {
            name: 'calculator',
            arguments: JSON.stringify({ expression: '1 + 1' }),
          },
        },
      ],
      assistantMessage: {
        role: 'assistant',
        content: null,
        tool_calls: [],
      },
    };
    const provider = {
      completeChat: jest.fn(async () => repeatedCompletion),
    } as unknown as DeepSeekProvider;
    const service = new AgentService(
      provider,
      new ToolRegistry(new CalculatorTool()),
    );
    const events: string[] = [];
    const response = {
      writableEnded: false,
      on: () => response,
      off: () => response,
      write: (event: string) => events.push(event),
      end: () => undefined,
    } as unknown as Response;

    try {
      await service.streamResponse('持续计算', response);
      expect(provider.completeChat).toHaveBeenCalledTimes(1);
      expect(events.join('')).toContain('超过最大执行步数（2）');
    } finally {
      if (previousMaxSteps === undefined) delete process.env.AGENT_MAX_STEPS;
      else process.env.AGENT_MAX_STEPS = previousMaxSteps;
    }
  });

  it('cancels a running task through its task id', async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const provider = {
      completeChat: jest.fn(
        async (_messages: unknown[], _tools: unknown[], signal: AbortSignal) =>
          new Promise<ChatCompletion>((_, reject) => {
            rejectRequest = reject;
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      ),
    } as unknown as DeepSeekProvider;
    const service = new AgentService(
      provider,
      new ToolRegistry(new CalculatorTool()),
    );
    const events: string[] = [];
    const response = {
      writableEnded: false,
      on: () => response,
      off: () => response,
      write: (event: string) => events.push(event),
      end: () => undefined,
    } as unknown as Response;

    const runningTask = service.streamResponse('取消这个任务', response);
    await Promise.resolve();
    const taskId = JSON.parse(events[0].slice(6)).taskId as string;

    expect(service.cancelTask(taskId)).toBe(true);
    rejectRequest?.(new Error('aborted'));
    await runningTask;

    expect(events.join('')).toContain('"type":"agent_cancelled"');
    expect(service.getTask(taskId)?.status).toBe('cancelled');
  });

  it('ends a task when it exceeds the configured timeout', async () => {
    const previousTimeout = process.env.AGENT_TIMEOUT_MS;
    process.env.AGENT_TIMEOUT_MS = '10';
    const provider = {
      completeChat: jest.fn(
        async (_messages: unknown[], _tools: unknown[], signal: AbortSignal) =>
          new Promise<ChatCompletion>((_, reject) => {
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      ),
    } as unknown as DeepSeekProvider;
    const service = new AgentService(
      provider,
      new ToolRegistry(new CalculatorTool()),
    );
    const events: string[] = [];
    const response = {
      writableEnded: false,
      on: () => response,
      off: () => response,
      write: (event: string) => events.push(event),
      end: () => undefined,
    } as unknown as Response;

    try {
      await service.streamResponse('超时任务', response);
      const taskId = JSON.parse(events[0].slice(6)).taskId as string;
      expect(events.join('')).toContain('Agent 任务超时');
      expect(service.getTask(taskId)?.status).toBe('timed_out');
    } finally {
      if (previousTimeout === undefined) delete process.env.AGENT_TIMEOUT_MS;
      else process.env.AGENT_TIMEOUT_MS = previousTimeout;
    }
  });
});
