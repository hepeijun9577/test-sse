# AI Agent 学习与实现规划

## 1. 文档目标

本项目当前是一个基于 NestJS、Vue 3 和 SSE 的流式聊天示例。本文规划在**不修改、不替换现有聊天功能**的前提下，新增一套用于学习 AI Agent 的实验系统。

目标不是一次性做成复杂平台，而是通过多个可验证的里程碑，逐步理解：

- LLM 调用与流式输出
- 结构化输出
- 工具调用
- Agent 执行循环
- 记忆与知识检索
- 任务规划、暂停和恢复
- 权限、安全和可观测性

## 2. 现状与隔离原则

当前功能保持原样：

- 后端 `POST /chat/stream`
- 后端 `POST /chat-md/stream`
- 前端 `/sse-text`
- 前端 `/sse-md`

新增 Agent 功能必须遵循以下边界：

1. 后端新增独立的 `agent` 模块，不修改 `chat` 和 `chat-md` 模块的业务逻辑。
2. 新增独立路由前缀，例如 `/agent/*`，不得复用或改变 `/chat/*`、`/chat-md/*`。
3. 前端新增独立的 `/agent` 页面，不改变现有页面的路由、组件和请求协议。
4. 新增配置使用独立的环境变量，不覆盖原有配置。
5. 每个里程碑完成后，必须运行旧功能测试和新增功能测试。
6. 如果实验功能失败，不能导致旧 SSE 请求不可用。

建议的新增目录：

```text
backend/src/agent/
  agent.module.ts
  agent.controller.ts
  agent.service.ts
  llm/
  tools/
  memory/

frontend/src/views/agent/
  index.vue
  components/
```

这些路径只是规划，实施时应保持现有项目的命名风格。

## 3. DeepSeek API 配置

本项目可以使用 DeepSeek API 作为模型提供方。API Key 只应通过后端环境变量提供，不能放在 Vue 前端、提交到 Git，或写入可访问的 Markdown 文档。

建议在本地配置：

```bash
# backend/.env.local，仅存在于本机，不提交到 Git
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

规划约束：

- 前端永远不直接调用 DeepSeek API。
- 后端启动时校验配置，但不在日志中打印完整 Key。
- 生产环境通过部署平台的 Secret 或环境变量注入。
- `.env.local`、`.env.*` 中包含真实 Key 时，必须加入 `.gitignore`。
- 文档只保留变量名和占位符，不把真实 API Key 作为项目资料保存。
- 如果当前阶段只是学习 Agent 流程，可以先实现可替换的 `LlmProvider` 接口，再接入 DeepSeek。

## 4. 总体架构

```text
Vue Agent 页面
    |
    |  SSE：任务事件、工具事件、文本增量、错误事件
    v
NestJS AgentController
    |
    v
AgentService / Agent Runtime
    |---- LlmProvider ------ DeepSeek API
    |---- ToolRegistry ------ calculator、time、search
    |---- MemoryStore ------- 会话消息与任务状态
    |---- ExecutionPolicy --- 步数、超时、权限、确认
    v
最终答案或待用户确认的动作
```

Agent 的基本执行循环：

```text
接收用户目标
  -> 读取会话上下文
  -> 请求模型决定下一步
  -> 如果是工具调用：校验并执行工具
  -> 将工具结果交给模型
  -> 重复执行，直到得到最终答案或需要人工确认
```

## 5. 里程碑规划

### M0：基线和安全准备

**目标**：在动 Agent 之前确认旧功能稳定，并准备 DeepSeek 配置方式。

**工作内容**：

- 记录现有 `/chat/stream` 和 `/chat-md/stream` 的请求、响应和 SSE 行为。
- 为现有聊天功能保留或补充回归测试。
- 新增环境变量说明和 Key 安全约定。
- 确认新增模块不会改变现有启动流程和路由。

**验收标准**：

- 原有后端单元测试和 E2E 测试通过。
- 原有 `/sse-text`、`/sse-md` 页面仍可发送消息并接收流式响应。
- 没有真实 API Key 被写入仓库。

### M1：新增 Agent 聊天入口

**目标**：新建一条独立的 Agent 请求链路，先实现“只调用模型，不调用工具”。

**建议接口**：

```text
POST /agent/chat/stream
```

请求示例：

```json
{
  "message": "请介绍一下你能做什么",
  "conversationId": "optional-id"
}
```

**工作内容**：

- 新建 `agent` NestJS 模块。
- 新建 DeepSeek Provider，封装模型 URL、请求体、错误处理和超时。
- 使用 SSE 推送 Agent 专用事件。
- 新建 `/agent` 前端页面，不复用旧聊天页面的业务状态。

**建议事件类型**：

```text
agent_started
message_delta
agent_completed
agent_error
```

**验收标准**：

- Agent 页面可以独立发送问题并看到流式答案。
- DeepSeek API Key 只在后端使用。
- 原有两个聊天接口行为不变。
- 缺少 Key 或模型请求失败时，Agent 页面显示可理解的错误。

### M2：结构化输出和第一个工具

**目标**：让模型能够明确表达“直接回答”或“请求调用工具”。

**第一个工具建议使用计算器**，因为结果容易验证，不依赖第三方服务。

工具协议示例：

```json
{
  "type": "tool_call",
  "tool": "calculator",
  "arguments": {
    "expression": "123 * 456"
  }
}
```

**工作内容**：

- 定义 `Tool` 接口和 `ToolRegistry`。
- 实现 calculator 工具，禁止直接执行任意 JavaScript 或 shell。
- 对模型输出和工具参数做 JSON Schema 或等价校验。
- 增加工具调用事件：`tool_started`、`tool_result`、`tool_error`。

**验收标准**：

- 用户询问计算问题时，Agent 能调用 calculator 并基于结果回答。
- 非法表达式被拒绝，不导致进程崩溃。
- 工具不存在、参数错误、执行超时都有明确错误事件。
- 前端能够区分普通文本和工具执行状态。

### M3：Agent 执行循环

**目标**：实现 Agent 的核心机制：模型决策、工具执行、结果回传、继续决策。

**工作内容**：

- 将一次模型请求抽象为一个执行步骤。
- 实现最大步骤数，例如默认不超过 8 步。
- 支持单次任务超时和用户主动取消。
- 为每次任务生成 `taskId`。
- 保存每一步的输入、决策、工具名、工具结果和耗时。

**验收标准**：

- Agent 能完成至少两步的任务。
- 能正确结束于最终答案，不会无限循环。
- 取消任务后，后端停止继续调用模型或工具。
- 每个任务都有可追踪的开始、步骤、完成或失败状态。

### M4：增加多个安全工具

**目标**：理解工具选择和工具边界，而不是让模型拥有无限权限。

建议依次加入：

1. `time`：返回服务器当前时间。
2. `knowledge_search`：先使用内存中的固定文档进行关键词检索。
3. `weather`：接入一个明确的天气 API，并设置超时和失败处理。

**工具设计要求**：

- 每个工具有唯一名称、描述、参数 schema 和执行函数。
- 工具通过白名单注册，模型不能动态创建工具。
- 外部 API 请求必须设置超时、响应大小限制和错误映射。
- 工具结果不能直接覆盖系统规则或权限策略。

**验收标准**：

- 模型能在多个工具之间做基本选择。
- 工具错误不会破坏 Agent 主循环。
- 前端能展示工具名称、参数摘要和执行结果摘要。

### M5：记忆和会话状态

**目标**：区分对话历史、任务状态和长期知识。

先实现轻量版本：

- 会话消息：保存当前对话中的用户消息和 Agent 消息。
- 任务状态：保存当前步骤、状态和取消标记。
- 对话摘要：当消息过长时生成摘要，减少下一次模型输入。

暂时可以使用内存存储；在需要持久化时再引入数据库。

**验收标准**：

- 同一个 `conversationId` 能保持上下文。
- 服务重启后的数据丢失行为被明确记录，不能假装已经持久化。
- 超出上下文限制时不会无限拼接历史消息。
- 不同会话之间不会串数据。

### M6：RAG 知识检索

**目标**：理解 Agent 调用知识能力与普通聊天的区别。

建议顺序：

1. 固定 Markdown 文档加载。
2. 分段和关键词检索。
3. 将检索结果作为受标记的上下文传给模型。
4. 再评估是否需要向量数据库和 Embedding。

**验收标准**：

- Agent 能从项目说明文档中回答可验证的问题。
- 找不到资料时明确说明，而不是编造引用。
- 检索内容和用户指令在提示词中有清晰边界。
- 前端能展示本次使用了哪些知识片段。

### M7：计划、人工确认和可恢复任务

**目标**：从单轮工具调用进入真正的任务编排。

示例任务：

```text
分析当前项目，整理后端接口、前端页面和系统架构，并生成报告。
```

计划步骤示例：

```text
1. 读取项目结构
2. 分析后端接口
3. 分析前端路由
4. 汇总架构信息
5. 生成报告
```

**工作内容**：

- 让 Agent 生成结构化计划。
- 支持查看计划、暂停、继续、取消和重试。
- 对高风险工具增加人工确认状态。
- 将任务状态从内存模型升级为可恢复模型。

**验收标准**：

- 用户能看到计划和当前步骤。
- 需要确认的动作不会自动执行。
- 服务短暂重启后，已持久化的任务可以恢复或明确失败。
- 失败步骤可以重试，不重复执行已经完成的危险动作。

### M8：评测、可观测性和安全收尾

**目标**：让 Agent 不只“能跑”，还可以被验证和维护。

**工作内容**：

- 建立固定评测集：直接问答、单工具、多工具、工具失败、取消、越权请求。
- 记录任务耗时、模型调用次数、Token 使用量和工具失败率。
- 增加结构化日志，但隐藏 API Key 和敏感内容。
- 增加速率限制、输入长度限制、费用预算和最大循环次数。
- 测试提示词注入、恶意工具参数和跨会话数据泄露。

**最终验收标准**：

- 旧聊天功能回归测试持续通过。
- Agent 的主要状态都可以从日志和事件流定位。
- 高风险操作有权限检查和人工确认。
- 模型不可用时，系统能返回可理解的降级错误。

## 6. 每个里程碑的固定开发流程

每个里程碑都按以下顺序执行：

1. 先写接口契约和验收场景。
2. 只在 `agent` 新模块或新增前端页面中实现。
3. 编写单元测试和必要的 E2E 测试。
4. 运行 Agent 测试。
5. 运行旧后端测试，确认 `/chat/*` 没有回归。
6. 手动验证 `/sse-text` 和 `/sse-md`。
7. 记录已知限制，再进入下一个里程碑。

建议每个里程碑都保留一个小而完整的提交，便于回退和比较学习效果；但不要为了规划文档自动创建提交。

## 7. 第一阶段建议的技术接口

以下只是接口方向，不要求现在立即实现：

```ts
interface LlmProvider {
  streamChat(input: ChatInput): AsyncIterable<LlmEvent>;
}

interface AgentTool<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  inputSchema: unknown;
  execute(input: Input, context: ToolContext): Promise<Output>;
}

type AgentEvent =
  | { type: "agent_started"; taskId: string }
  | { type: "message_delta"; taskId: string; content: string }
  | { type: "tool_started"; taskId: string; tool: string }
  | { type: "tool_result"; taskId: string; tool: string; result: unknown }
  | { type: "agent_completed"; taskId: string }
  | { type: "agent_error"; taskId: string; message: string };
```

接口的目的，是让 DeepSeek 成为可替换的模型实现，让工具成为可测试的独立单元，并让前端只依赖稳定的 Agent 事件协议。

## 8. 第一条可交付主线

建议先完成下面这条最小闭环：

```text
M0 基线
  -> M1 DeepSeek 流式 Agent 页面
  -> M2 calculator 工具
  -> M3 两步执行循环
```

最终演示场景：

> 用户输入“计算 123 \* 456，并用 Markdown 解释计算结果”。Agent 调用 calculator，读取工具结果，再通过 SSE 输出最终 Markdown 答案；原有 `/sse-text` 和 `/sse-md` 页面同时保持正常工作。

完成这条主线后，已经可以通过真实项目理解 Agent 与普通聊天的核心区别，再继续增加记忆、RAG、规划和权限，而不必一开始引入过多框架。

## 9. 暂不做的事情

为了控制学习范围，第一轮暂不做：

- 多 Agent 协作
- 任意 Shell 执行
- 自动修改项目文件
- 自动发送邮件或执行外部写操作
- 一开始就引入向量数据库
- 一开始就绑定不可替换的 Agent 框架

这些能力应在单 Agent 执行循环、工具权限和测试体系稳定后再评估。
