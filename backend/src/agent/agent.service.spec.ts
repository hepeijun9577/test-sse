import type { Response } from 'express';
import { AgentService } from './agent.service';
import type {
  ChatCompletion,
  DeepSeekProvider,
} from './llm/deepseek.provider';
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
    const service = new AgentService(provider, new ToolRegistry(new CalculatorTool()));
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
});