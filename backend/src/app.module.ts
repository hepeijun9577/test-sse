import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { ChatMdModule } from './chat-md/chat-md.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [ChatModule, ChatMdModule, AgentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
