import { Injectable } from '@nestjs/common';

export interface AgentTool {
  name: string;
  description: string;
  definition: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  execute(input: unknown): Promise<unknown>;
}

class CalculatorParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.index !== this.expression.length) {
      throw new Error('表达式包含不支持的字符');
    }
    if (!Number.isFinite(value)) throw new Error('计算结果不是有限数字');
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      this.skipWhitespace();
      const operator = this.expression[this.index];
      if (operator !== '+' && operator !== '-') return value;
      this.index += 1;
      const right = this.parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    while (true) {
      this.skipWhitespace();
      const operator = this.expression[this.index];
      if (operator !== '*' && operator !== '/') return value;
      this.index += 1;
      const right = this.parseFactor();
      if (operator === '/' && right === 0) throw new Error('不能除以零');
      value = operator === '*' ? value * right : value / right;
    }
  }

  private parseFactor(): number {
    this.skipWhitespace();
    const operator = this.expression[this.index];
    if (operator === '+' || operator === '-') {
      this.index += 1;
      const value = this.parseFactor();
      return operator === '-' ? -value : value;
    }

    if (operator === '(') {
      this.index += 1;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.expression[this.index] !== ')') throw new Error('括号不匹配');
      this.index += 1;
      return value;
    }

    const start = this.index;
    while (/[0-9.]/.test(this.expression[this.index] ?? '')) this.index += 1;
    if (start === this.index) {
      if (this.index >= this.expression.length) throw new Error('缺少数字');
      throw new Error('表达式包含不支持的字符');
    }

    const value = Number(this.expression.slice(start, this.index));
    if (!Number.isFinite(value)) throw new Error('数字格式无效');
    return value;
  }

  private skipWhitespace() {
    while (/\s/.test(this.expression[this.index] ?? '')) this.index += 1;
  }
}

@Injectable()
export class CalculatorTool implements AgentTool {
  name = 'calculator';
  description = '计算只包含数字、小数点、括号和 + - * / 的数学表达式。';
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '例如 (12 + 3) * 4',
          },
        },
        required: ['expression'],
        additionalProperties: false,
      },
    },
  };

  async execute(
    input: unknown,
  ): Promise<{ expression: string; result: number }> {
    if (!input || typeof input !== 'object' || !('expression' in input)) {
      throw new Error('calculator 参数必须包含 expression');
    }

    const expression = (input as { expression: unknown }).expression;
    if (typeof expression !== 'string' || !expression.trim()) {
      throw new Error('expression 必须是非空字符串');
    }
    if (expression.length > 200) throw new Error('表达式过长');

    return {
      expression,
      result: new CalculatorParser(expression).parse(),
    };
  }
}
