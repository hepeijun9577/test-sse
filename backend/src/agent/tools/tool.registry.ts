import { Injectable } from '@nestjs/common';
import type { ChatToolDefinition } from '../llm/deepseek.provider';
import { CalculatorTool, type AgentTool } from './calculator.tool';
import { KnowledgeSearchTool } from './knowledge-search.tool';
import { TimeTool } from './time.tool';
import { WeatherTool } from './weather.tool';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(
    calculatorTool: CalculatorTool,
    timeTool: TimeTool,
    knowledgeSearchTool: KnowledgeSearchTool,
    weatherTool: WeatherTool,
  ) {
    for (const tool of [
      calculatorTool,
      timeTool,
      knowledgeSearchTool,
      weatherTool,
    ]) {
      this.tools.set(tool.name, tool);
    }
  }

  definitions(): ChatToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(
    name: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`不允许调用工具：${name}`);
    return tool.execute(input, signal);
  }
}
