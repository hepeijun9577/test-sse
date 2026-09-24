import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { DeepSeekProvider } from './llm/deepseek.provider';
import { CalculatorTool } from './tools/calculator.tool';
import { KnowledgeSearchTool } from './tools/knowledge-search.tool';
import { TimeTool } from './tools/time.tool';
import { ToolRegistry } from './tools/tool.registry';
import { WeatherTool } from './tools/weather.tool';

@Module({
  controllers: [AgentController],
  providers: [
    AgentService,
    DeepSeekProvider,
    CalculatorTool,
    TimeTool,
    KnowledgeSearchTool,
    WeatherTool,
    ToolRegistry,
  ],
})
export class AgentModule {}
