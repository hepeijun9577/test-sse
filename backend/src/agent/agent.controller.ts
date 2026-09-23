import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
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
}
