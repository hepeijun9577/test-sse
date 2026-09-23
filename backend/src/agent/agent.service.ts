import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  ChatMessage,
  DeepSeekProvider,
  ToolCall,
} from './llm/deepseek.provider';
import { ToolRegistry } from './tools/tool.registry';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llmProvider: DeepSeekProvider,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async streamResponse(message: string, res: Response): Promise<void> {
    const taskId = randomUUID();
    const abortController = new AbortController();
    let clientClosed = false;
    let completed = false;
    const startedAt = Date.now();

    this.logger.log(
      `request_received taskId=${taskId} messageLength=${message.length}`,
    );

    const handleClose = () => {
      if (completed) return;
      clientClosed = true;
      abortController.abort();
      this.logger.warn(`client_disconnected taskId=${taskId}`);
    };

    const send = (event: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    res.on('close', handleClose);
    send({ type: 'agent_started', taskId });

    try {
      const messages: ChatMessage[] = [{ role: 'user', content: message }];
      this.logger.log(`planning_started taskId=${taskId}`);
      const firstCompletion = await this.llmProvider.completeChat(
        messages,
        this.toolRegistry.definitions(),
        abortController.signal,
        'tool_decision',
      );

      if (firstCompletion.toolCalls.length === 0) {
        this.logger.log(
          `direct_answer taskId=${taskId} contentLength=${firstCompletion.content?.length ?? 0}`,
        );
        send({ type: 'message_delta', content: firstCompletion.content ?? '' });
      } else {
        this.logger.log(
          `tool_plan taskId=${taskId} tools=${firstCompletion.toolCalls.map((toolCall) => toolCall.function.name).join(',')}`,
        );
        messages.push(firstCompletion.assistantMessage);
        for (const toolCall of firstCompletion.toolCalls) {
          if (clientClosed) return;
          await this.executeTool(taskId, toolCall, messages, send);
        }

        const finalCompletion = await this.llmProvider.completeChat(
          messages,
          [],
          abortController.signal,
          'final_answer',
        );
        this.logger.log(
          `final_answer taskId=${taskId} contentLength=${finalCompletion.content?.length ?? 0}`,
        );
        send({ type: 'message_delta', content: finalCompletion.content ?? '' });
      }

      send({ type: 'agent_completed' });
      completed = true;
      this.logger.log(
        `request_completed taskId=${taskId} durationMs=${Date.now() - startedAt}`,
      );
      if (!res.writableEnded) res.end();
    } catch (error) {
      if (clientClosed) return;

      const messageText =
        error instanceof Error ? error.message : 'Agent 请求失败';
      this.logger.error(
        `request_failed taskId=${taskId} durationMs=${Date.now() - startedAt} message=${messageText}`,
        error instanceof Error ? error.stack : undefined,
      );
      send({ type: 'agent_error', message: messageText });
      completed = true;
      if (!res.writableEnded) res.end();
    } finally {
      res.off('close', handleClose);
    }
  }

  private async executeTool(
    taskId: string,
    toolCall: ToolCall,
    messages: ChatMessage[],
    send: (event: Record<string, unknown>) => void,
  ) {
    const toolName = toolCall.function.name;
    this.logger.log(
      `tool_started taskId=${taskId} tool=${toolName} callId=${toolCall.id} argumentsLength=${toolCall.function.arguments.length}`,
    );
    send({ type: 'tool_started', tool: toolName, callId: toolCall.id });

    try {
      const input = JSON.parse(toolCall.function.arguments) as unknown;
      const result = await this.toolRegistry.execute(toolName, input);
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });
      this.logger.log(
        `tool_result taskId=${taskId} tool=${toolName} callId=${toolCall.id} resultType=${Array.isArray(result) ? 'array' : typeof result}`,
      );
      send({
        type: 'tool_result',
        tool: toolName,
        callId: toolCall.id,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败';
      this.logger.error(
        `tool_error taskId=${taskId} tool=${toolName} callId=${toolCall.id} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      messages.push({
        role: 'tool',
        content: JSON.stringify({ error: message }),
        tool_call_id: toolCall.id,
      });
      send({
        type: 'tool_error',
        tool: toolName,
        callId: toolCall.id,
        message,
      });
    }
  }
}
