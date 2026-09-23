import { CalculatorTool } from './calculator.tool';

describe('CalculatorTool', () => {
  const calculator = new CalculatorTool();

  it('evaluates arithmetic without executing arbitrary code', async () => {
    await expect(
      calculator.execute({ expression: '(12 + 3) * 4 - 2 / 2' }),
    ).resolves.toEqual({
      expression: '(12 + 3) * 4 - 2 / 2',
      result: 59,
    });
  });

  it('rejects unsupported expressions', async () => {
    await expect(calculator.execute({ expression: '2 ** 3' })).rejects.toThrow(
      '表达式包含不支持的字符',
    );
    await expect(calculator.execute({ expression: '1 / 0' })).rejects.toThrow(
      '不能除以零',
    );
  });
});
