import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { DeepSeekProvider } from './llm/deepseek.provider';
import { CalculatorTool } from './tools/calculator.tool';
import { ToolRegistry } from './tools/tool.registry';

@Module({
  controllers: [AgentController],
  providers: [AgentService, DeepSeekProvider, CalculatorTool, ToolRegistry],
})
export class AgentModule {}
