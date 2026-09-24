import { Injectable } from '@nestjs/common';
import type { AgentTool } from './calculator.tool';

@Injectable()
export class TimeTool implements AgentTool {
  name = 'time';
  description = '返回服务器当前时间和 ISO 8601 时间。';
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  };

  async execute(_input: unknown, _signal?: AbortSignal) {
    const now = new Date();
    return {
      iso: now.toISOString(),
      timestamp: now.getTime(),
    };
  }
}
