import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletion {
  content: string | null;
  toolCalls: ToolCall[];
  assistantMessage: ChatMessage;
}

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}

@Injectable()
export class DeepSeekProvider {
  private readonly logger = new Logger(DeepSeekProvider.name);

  async completeChat(
    messages: ChatMessage[],
    tools: ChatToolDefinition[],
    signal: AbortSignal,
    phase = 'unknown',
  ): Promise<ChatCompletion> {
    this.logger.log(
      `model_request phase=${phase} messages=${messages.length} tools=${tools.map((tool) => tool.function.name).join(',') || 'none'}`,
    );

    const response = await this.request(
      {
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: false,
      },
      signal,
    );

    const choice = response.choices?.[0]?.message;
    if (!choice) throw new Error('DeepSeek 未返回有效回答');

    const toolCalls = choice.tool_calls ?? [];
    this.logger.log(
      `model_response phase=${phase} contentLength=${choice.content?.length ?? 0} toolCalls=${toolCalls.map((toolCall) => toolCall.function.name).join(',') || 'none'}`,
    );
    return {
      content: choice.content ?? null,
      toolCalls,
      assistantMessage: {
        role: 'assistant',
        content: choice.content ?? null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    };
  }

  private async request(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<DeepSeekResponse> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'replace-with-your-deepseek-api-key') {
      throw new Error('DEEPSEEK_API_KEY 未配置');
    }

    const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
    const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, ...body }),
      signal,
    });

    if (!response.ok) {
      this.logger.error(
        `model_http_error status=${response.status} durationMs=${Date.now() - startedAt}`,
      );
      throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
    }

    const result = (await response.json()) as DeepSeekResponse;
    this.logger.log(
      `model_http_success status=${response.status} durationMs=${Date.now() - startedAt}`,
    );
    return result;
  }
}
