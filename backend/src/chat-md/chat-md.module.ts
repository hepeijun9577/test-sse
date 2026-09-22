import { Module } from '@nestjs/common';
import { ChatMdController } from './chat-md.controller';
import { ChatMdService } from './chat-md.service';

@Module({
  controllers: [ChatMdController],
  providers: [ChatMdService],
})
export class ChatMdModule {}
