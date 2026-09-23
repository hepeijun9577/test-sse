import { Injectable } from '@nestjs/common';
import type { ChatToolDefinition } from '../llm/deepseek.provider';
import { CalculatorTool, type AgentTool } from './calculator.tool';

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(calculatorTool: CalculatorTool) {
    this.tools.set(calculatorTool.name, calculatorTool);
  }

  definitions(): ChatToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`不允许调用工具：${name}`);
    return tool.execute(input);
  }
}
