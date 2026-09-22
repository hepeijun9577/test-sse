import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

const MARKDOWN_RESPONSES: Record<string, string> = {
  default: `## Markdown SSE 演示

这是通过 **SSE + JSON + Markdown** 返回的流式内容。

你可以尝试：

- 输入“介绍”查看技术说明
- 输入“表格”查看 Markdown 表格
- 输入“代码”查看代码高亮内容`,
  介绍: `## Markdown 流式输出

后端通过 SSE 推送 JSON 消息，消息中的 \x60content\x60 字段携带 Markdown 文本。

前端收到增量内容后，会使用 Markdown 解析器渲染标题、列表、代码和表格。`,
  表格: `## 本月数据

| 项目 | 数值 | 趋势 |
| --- | ---: | --- |
| 新用户 | 1,280 | 上升 |
| 活跃用户 | 8,642 | 稳定 |
| 转化率 | 18.6% | 上升 |`,
  代码: `## 代码示例

下面是一段 JavaScript：

\x60\x60\x60ts
const stream = await fetch('/chat-md/stream', {
  method: 'POST',
  body: JSON.stringify({ message: '你好' }),
})
\x60\x60\x60`,
};

interface MarkdownEvent {
  type: 'ui' | 'tool_call' | 'citation' | 'file' | 'progress';
  [key: string]: unknown;
}

function getMarkdownEvents(message: string): MarkdownEvent[] {
  const lower = message.toLowerCase();
  const events: MarkdownEvent[] = [];

  if (lower.includes('图表') || lower.includes('chart')) {
    events.push({
      type: 'ui',
      component: 'chart',
      props: {
        title: '月度销售额',
        unit: '万元',
        data: [
          { label: '一月', value: 120 },
          { label: '二月', value: 180 },
          { label: '三月', value: 150 },
          { label: '四月', value: 220 },
        ],
      },
    });
  }

  if (lower.includes('表单') || lower.includes('form')) {
    events.push({
      type: 'ui',
      component: 'form',
      props: {
        title: '反馈表单',
        submitLabel: '提交反馈',
        fields: [
          { name: 'name', label: '姓名', type: 'text', required: true },
          { name: 'email', label: '邮箱', type: 'email', required: true },
          {
            name: 'feedback',
            label: '反馈内容',
            type: 'textarea',
            required: true,
          },
        ],
      },
    });
  }

  if (lower.includes('工具') || lower.includes('tool')) {
    events.push(
      {
        type: 'tool_call',
        phase: 'start',
        id: 'weather-001',
        name: 'get_weather',
        arguments: { city: '杭州', unit: 'celsius' },
      },
      {
        type: 'tool_call',
        phase: 'result',
        id: 'weather-001',
        name: 'get_weather',
        result: { city: '杭州', temperature: 26, condition: '晴' },
      },
    );
  }

  if (
    lower.includes('引用') ||
    lower.includes('来源') ||
    lower.includes('citation')
  ) {
    events.push({
      type: 'citation',
      id: 'source-001',
      title: 'Server-Sent Events - MDN',
      source: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/docs/Web/API/Server-sent_events',
      snippet:
        'Server-sent events allow a server to push data to a web page over HTTP.',
    });
  }

  if (lower.includes('文件') || lower.includes('file')) {
    events.push({
      type: 'file',
      name: 'sales-report.csv',
      mimeType: 'text/csv',
      size: 86,
      preview: 'month,sales\nJanuary,120\nFebruary,180\nMarch,150\nApril,220',
    });
  }

  if (lower.includes('进度') || lower.includes('progress')) {
    events.push({
      type: 'progress',
      task: '生成季度报告',
      percent: 72,
      status: 'running',
      steps: [
        { label: '整理数据', status: 'done' },
        { label: '生成图表', status: 'done' },
        { label: '输出报告', status: 'running' },
      ],
    });
  }

  return events;
}

function getMarkdownResponse(message: string): string {
  const lower = message.toLowerCase().trim();

  for (const [key, value] of Object.entries(MARKDOWN_RESPONSES)) {
    if (key !== 'default' && lower.includes(key)) {
      return value;
    }
  }

  return MARKDOWN_RESPONSES.default;
}

@Injectable()
export class ChatMdService {
  async streamResponse(message: string, res: Response): Promise<void> {
    const chars = Array.from(getMarkdownResponse(message));
    const events = getMarkdownEvents(message);

    return new Promise((resolve) => {
      let index = 0;
      let eventIndex = 0;
      let closed = false;

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        resolve();
      };

      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      const interval = setInterval(() => {
        if (index >= chars.length) {
          if (eventIndex < events.length) {
            res.write(`data: ${JSON.stringify(events[eventIndex])}\n\n`);
            eventIndex += 1;
            return;
          }

          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
          finish();
          return;
        }

        const chunkSize = Math.random() > 0.7 ? 2 : 1;
        const chunk = chars.slice(index, index + chunkSize).join('');
        index += chunkSize;

        res.write(
          `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`,
        );
      }, 50);

      res.on('close', finish);
    });
  }
}
