import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  ChatMessage,
  DeepSeekProvider,
  ToolCall,
} from './llm/deepseek.provider';
import { ToolRegistry } from './tools/tool.registry';

export type AgentTaskStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentStep {
  index: number;
  type: 'model_decision' | 'tool_execution';
  status: 'running' | 'completed' | 'failed';
  input: Record<string, unknown>;
  decision?: Record<string, unknown>;
  tool?: string;
  result?: unknown;
  error?: string;
  startedAt: string;
  durationMs?: number;
}

export interface AgentTask {
  taskId: string;
  status: AgentTaskStatus;
  messageLength: number;
  maxSteps: number;
  timeoutMs: number;
  startedAt: string;
  completedAt?: string;
  steps: AgentStep[];
  abortController: AbortController;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly tasks = new Map<string, AgentTask>();

  constructor(
    private readonly llmProvider: DeepSeekProvider,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async streamResponse(message: string, res: Response): Promise<void> {
    const task = this.createTask(message);
    const { taskId, abortController } = task;
    let clientClosed = false;
    let responseClosed = false;
    const startedAt = Date.now();
    const timeoutHandle = setTimeout(() => {
      if (task.status !== 'running') return;
      task.status = 'timed_out';
      abortController.abort();
      this.logger.warn(
        `task_timeout taskId=${taskId} timeoutMs=${task.timeoutMs}`,
      );
    }, task.timeoutMs);

    this.logger.log(
      `request_received taskId=${taskId} messageLength=${message.length} maxSteps=${task.maxSteps} timeoutMs=${task.timeoutMs}`,
    );

    const handleClose = () => {
      if (responseClosed || task.status !== 'running') return;
      clientClosed = true;
      task.status = 'cancelled';
      abortController.abort();
      this.failRunningSteps(task, '客户端已断开');
      task.completedAt = new Date().toISOString();
      this.logger.warn(`client_disconnected taskId=${taskId}`);
    };

    const send = (event: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ taskId, ...event })}\n\n`);
      }
    };

    res.on('close', handleClose);
    send({ type: 'agent_started' });

    try {
      const messages: ChatMessage[] = [{ role: 'user', content: message }];
      this.logger.log(`planning_started taskId=${taskId}`);

      while (task.steps.length < task.maxSteps) {
        if (clientClosed || abortController.signal.aborted) return;

        const modelStep = this.startStep(task, 'model_decision', {
          messageCount: messages.length,
          availableTools: this.toolRegistry
            .definitions()
            .map((tool) => tool.function.name),
        });
        const completion = await this.llmProvider.completeChat(
          messages,
          this.toolRegistry.definitions(),
          abortController.signal,
          'tool_decision',
        );

        modelStep.decision = {
          toolCalls: completion.toolCalls.map(
            (toolCall) => toolCall.function.name,
          ),
          contentLength: completion.content?.length ?? 0,
        };
        this.completeStep(modelStep);

        if (completion.toolCalls.length === 0) {
          this.logger.log(
            `final_answer taskId=${taskId} step=${modelStep.index} contentLength=${completion.content?.length ?? 0}`,
          );
          send({ type: 'message_delta', content: completion.content ?? '' });
          this.finishTask(task, 'completed');
          send({ type: 'agent_completed' });
          responseClosed = true;
          res.end();
          return;
        }

        this.logger.log(
          `tool_plan taskId=${taskId} step=${modelStep.index} tools=${completion.toolCalls.map((toolCall) => toolCall.function.name).join(',')}`,
        );
        messages.push(completion.assistantMessage);

        for (const toolCall of completion.toolCalls) {
          if (clientClosed || abortController.signal.aborted) return;
          if (task.steps.length >= task.maxSteps) {
            throw new Error(`超过最大执行步数（${task.maxSteps}）`);
          }
          await this.executeTool(
            task,
            toolCall,
            messages,
            send,
            abortController.signal,
          );
        }
      }

      throw new Error(`超过最大执行步数（${task.maxSteps}）`);
    } catch (error) {
      if (clientClosed) return;

      const messageText = this.getTaskError(task, error);
      const status =
        task.status === 'cancelled' || task.status === 'timed_out'
          ? task.status
          : 'failed';
      this.failRunningSteps(task, messageText);
      this.finishTask(task, status);
      this.logger.error(
        `request_failed taskId=${taskId} status=${status} durationMs=${Date.now() - startedAt} message=${messageText}`,
        error instanceof Error ? error.stack : undefined,
      );
      send({
        type: status === 'cancelled' ? 'agent_cancelled' : 'agent_error',
        message: messageText,
      });
      responseClosed = true;
      if (!res.writableEnded) res.end();
    } finally {
      clearTimeout(timeoutHandle);
      res.off('close', handleClose);
    }
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'cancelled';
    task.abortController.abort();
    this.logger.warn(`task_cancelled taskId=${taskId}`);
    return true;
  }

  getTask(taskId: string): Omit<AgentTask, 'abortController'> | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;
    const { abortController: _abortController, ...publicTask } = task;
    return publicTask;
  }

  private createTask(message: string): AgentTask {
    const task: AgentTask = {
      taskId: randomUUID(),
      status: 'running',
      messageLength: message.length,
      maxSteps: this.readPositiveInteger('AGENT_MAX_STEPS', 8, 50),
      timeoutMs: this.readPositiveInteger('AGENT_TIMEOUT_MS', 30000, 300000),
      startedAt: new Date().toISOString(),
      steps: [],
      abortController: new AbortController(),
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  private startStep(
    task: AgentTask,
    type: AgentStep['type'],
    input: Record<string, unknown>,
    tool?: string,
  ): AgentStep {
    const step: AgentStep = {
      index: task.steps.length + 1,
      type,
      status: 'running',
      input,
      tool,
      startedAt: new Date().toISOString(),
    };
    task.steps.push(step);
    return step;
  }

  private completeStep(step: AgentStep) {
    step.status = 'completed';
    step.durationMs = Date.now() - Date.parse(step.startedAt);
  }

  private failStep(step: AgentStep, message: string) {
    step.status = 'failed';
    step.error = message;
    step.durationMs = Date.now() - Date.parse(step.startedAt);
  }

  private failRunningSteps(task: AgentTask, message: string) {
    for (const step of task.steps) {
      if (step.status === 'running') this.failStep(step, message);
    }
  }

  private async executeTool(
    task: AgentTask,
    toolCall: ToolCall,
    messages: ChatMessage[],
    send: (event: Record<string, unknown>) => void,
    signal: AbortSignal,
  ) {
    const toolName = toolCall.function.name;
    const toolStep = this.startStep(
      task,
      'tool_execution',
      {
        callId: toolCall.id,
        argumentsLength: toolCall.function.arguments.length,
      },
      toolName,
    );
    this.logger.log(
      `tool_started taskId=${task.taskId} step=${toolStep.index} tool=${toolName} callId=${toolCall.id}`,
    );
    send({
      type: 'tool_started',
      step: toolStep.index,
      tool: toolName,
      callId: toolCall.id,
    });

    try {
      const input = JSON.parse(toolCall.function.arguments) as unknown;
      toolStep.input = { callId: toolCall.id, value: input };
      const result = await this.toolRegistry.execute(toolName, input, signal);
      toolStep.result = result;
      this.completeStep(toolStep);
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      });
      this.logger.log(
        `tool_result taskId=${task.taskId} step=${toolStep.index} tool=${toolName} callId=${toolCall.id} durationMs=${toolStep.durationMs}`,
      );
      send({
        type: 'tool_result',
        step: toolStep.index,
        tool: toolName,
        callId: toolCall.id,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败';
      this.failStep(toolStep, message);
      this.logger.error(
        `tool_error taskId=${task.taskId} step=${toolStep.index} tool=${toolName} message=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      messages.push({
        role: 'tool',
        content: JSON.stringify({ error: message }),
        tool_call_id: toolCall.id,
      });
      send({
        type: 'tool_error',
        step: toolStep.index,
        tool: toolName,
        callId: toolCall.id,
        message,
      });
    }
  }

  private finishTask(task: AgentTask, status: AgentTaskStatus) {
    task.status = status;
    task.completedAt = new Date().toISOString();
    this.logger.log(`task_state taskId=${task.taskId} status=${status}`);
  }

  private getTaskError(task: AgentTask, error: unknown): string {
    if (task.status === 'timed_out') return 'Agent 任务超时';
    if (task.status === 'cancelled') return 'Agent 任务已取消';
    return error instanceof Error ? error.message : 'Agent 请求失败';
  }

  private readPositiveInteger(
    name: string,
    fallback: number,
    maximum: number,
  ): number {
    const value = Number.parseInt(process.env[name] ?? '', 10);
    if (!Number.isInteger(value) || value < 1) return fallback;
    return Math.min(value, maximum);
  }
}
