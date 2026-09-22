import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatMdService } from './chat-md.service';

@Controller('chat-md')
export class ChatMdController {
  constructor(private readonly chatMdService: ChatMdService) {}

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  async stream(
    @Body() body: { message: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await this.chatMdService.streamResponse(body.message, res);
  }
}
