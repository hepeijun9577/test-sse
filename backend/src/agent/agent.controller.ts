import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Post,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat/stream')
  @HttpCode(HttpStatus.OK)
  async stream(
    @Body() body: { message?: unknown },
    @Res() res: Response,
  ): Promise<void> {
    if (typeof body?.message !== 'string' || !body.message.trim()) {
      throw new BadRequestException('message 必须是非空字符串');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.agentService.streamResponse(body.message.trim(), res);
  }

  @Post('tasks/:taskId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('taskId') taskId: string) {
    const cancelled = this.agentService.cancelTask(taskId);
    if (!cancelled) {
      throw new NotFoundException('任务不存在或已经结束');
    }
    return { taskId, cancelled: true };
  }

  @Get('tasks/:taskId')
  getTask(@Param('taskId') taskId: string) {
    const task = this.agentService.getTask(taskId);
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }
}
