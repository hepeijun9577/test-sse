import { Injectable } from '@nestjs/common';
import type { AgentTool } from './calculator.tool';

interface KnowledgeDocument {
  title: string;
  content: string;
  keywords: string[];
}

const DOCUMENTS: KnowledgeDocument[] = [
  {
    title: 'Agent 执行循环',
    content:
      'Agent 会读取用户目标，调用模型决定下一步；如果模型请求工具，系统会校验并执行工具，再把结果回传模型，直到生成最终答案。',
    keywords: ['agent', '执行循环', '工具', '模型', '任务'],
  },
  {
    title: 'SSE 流式通信',
    content:
      'SSE 是基于 HTTP 的服务器到客户端单向推送协议，适合将 Agent 的状态、工具事件和文本增量实时发送给前端。',
    keywords: ['sse', '流式', '事件', '前端', 'http'],
  },
  {
    title: '项目隔离原则',
    content:
      'Agent 功能使用独立的 /agent 路由和模块，不修改原有 /chat 和 /chat-md 路由，旧功能需要持续通过回归测试。',
    keywords: ['路由', '模块', 'chat', 'chat-md', '回归测试'],
  },
];

@Injectable()
export class KnowledgeSearchTool implements AgentTool {
  name = 'knowledge_search';
  description = '从项目内置知识文档中检索与问题相关的内容。';
  definition = {
    type: 'function' as const,
    function: {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要检索的关键词或问题',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  };

  async execute(input: unknown, _signal?: AbortSignal) {
    if (!input || typeof input !== 'object' || !('query' in input)) {
      throw new Error('knowledge_search 参数必须包含 query');
    }

    const query = (input as { query: unknown }).query;
    if (typeof query !== 'string' || !query.trim()) {
      throw new Error('query 必须是非空字符串');
    }
    if (query.length > 200) throw new Error('query 过长');

    const normalizedQuery = query.trim().toLowerCase();
    const matches = DOCUMENTS.map((document) => {
      const keywordScore = document.keywords.filter((keyword) =>
        normalizedQuery.includes(keyword.toLowerCase()),
      ).length;
      const contentScore = document.content
        .toLowerCase()
        .includes(normalizedQuery)
        ? 2
        : 0;
      return { document, score: keywordScore + contentScore };
    })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map(({ document }) => ({
        title: document.title,
        content: document.content,
      }));

    return {
      query: query.trim(),
      matches,
      source: 'in-memory-project-documents',
    };
  }
}
