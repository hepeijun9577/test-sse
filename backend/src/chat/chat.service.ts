import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

// 模拟 AI 回复语料
const AI_RESPONSES: Record<string, string> = {
  default:
    '您好！我是 AI 助手。我可以回答您的问题，帮助您解决问题。有什么我可以帮您的吗？',
  你好: '你好！很高兴见到你。今天有什么我可以帮你的吗？',
  hello: 'Hello! How can I assist you today? I am your AI assistant.',
  介绍: '我是一个基于 SSE（Server-Sent Events）协议的 AI 对话助手演示项目。\n\n技术栈：\n- 后端：NestJS + SSE\n- 前端：Vue3 + Vite + Element Plus\n\n通过 SSE 协议，服务端可以实时向客户端推送数据流，实现打字机效果的 AI 回复。',
  sse: 'SSE（Server-Sent Events）是一种服务器向客户端单向推送数据的技术。\n\n与 WebSocket 相比，SSE 基于标准 HTTP 协议，实现更简单，非常适合 AI 对话这类单向流式输出的场景。\n\n数据格式为：\ndata: {内容}\n\n当发送 data: [DONE] 时表示流结束。',
  马云: '马云，1964年9月10日出生于浙江杭州 [315]，祖籍浙江省嵊县（现嵊州市）谷来镇 [316]，汉族，中共党员 [1]，阿里巴巴主要创始人之一 [332]，阿里巴巴原首席执行官（CEO） [325]、董事局原主席 [4]，中国人民政治协商会议第十届浙江省委员会委员 [317]，第十一届全国政协委员 [318]，第十二届全国政协委员 [319]，第十三届全国政协委员 [320]，第十四届全国政协委员 [321]，中国企业家 [322]，慈善家 [323]，投资人 [324]。',
};

function getAIResponse(message: string): string {
  const lower = message.toLowerCase().trim();
  for (const [key, value] of Object.entries(AI_RESPONSES)) {
    if (key !== 'default' && lower.includes(key)) {
      return value;
    }
  }
  return AI_RESPONSES.default;
}

@Injectable()
export class ChatService {
  async streamResponse(message: string, res: Response): Promise<void> {
    const fullResponse = getAIResponse(message);

    // 将响应按字符分割，模拟逐字输出
    const chars = Array.from(fullResponse);

    return new Promise((resolve) => {
      let index = 0;

      // 先发送一个开始信号
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

      const interval = setInterval(() => {
        if (index >= chars.length) {
          // 发送结束信号
          res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          res.end();
          clearInterval(interval);
          resolve();
          return;
        }

        // 每次发送 1-2 个字符，模拟真实 AI 输出节奏
        const chunkSize = Math.random() > 0.7 ? 2 : 1;
        const chunk = chars.slice(index, index + chunkSize).join('');
        index += chunkSize;

        res.write(
          `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`,
        );
      }, 50); // 每 50ms 输出一次

      // 客户端断开连接时清除定时器
      res.on('close', () => {
        clearInterval(interval);
        resolve();
      });
    });
  }
}
