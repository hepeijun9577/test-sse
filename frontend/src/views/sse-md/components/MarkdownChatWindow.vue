<template>
  <div class="chat-container">
    <div ref="messageListRef" class="message-list">
      <div v-if="messages.length === 0" class="empty-hint">
        <el-icon size="48" color="#c0c4cc"><i-ep-document /></el-icon>
        <p>试着发送一条消息，查看 Markdown 流式渲染效果</p>
        <div class="hint-tags">
          <el-tag v-for="hint in hints" :key="hint" class="hint-tag" effect="plain" @click="sendHint(hint)">{{
            hint
          }}</el-tag>
        </div>
      </div>

      <div v-for="(msg, index) in messages" :key="index" :class="['message-item', msg.role]">
        <el-avatar v-if="msg.role === 'assistant'" class="avatar assistant-avatar">AI</el-avatar>

        <div class="bubble-wrapper">
          <div :class="['bubble', msg.role]">
            <div v-if="msg.role === 'assistant'" class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
            <span v-else class="message-text">{{ msg.content }}</span>
            <span v-if="msg.streaming" class="cursor">▋</span>

            <div v-for="block in msg.blocks" :key="block.id" class="ui-block">
              <section v-if="block.kind === 'chart'" class="data-card">
                <div class="block-title">{{ block.data.title }}</div>
                <div class="chart" :aria-label="String(block.data.title || '数据图表')">
                  <div v-for="item in block.data.data" :key="item.label" class="chart-column">
                    <div class="chart-value">{{ item.value }}{{ block.data.unit }}</div>
                    <div class="chart-bar-track">
                      <div class="chart-bar" :style="{ height: `${chartHeight(item.value, block.data.data)}%` }"></div>
                    </div>
                    <div class="chart-label">{{ item.label }}</div>
                  </div>
                </div>
              </section>

              <section v-else-if="block.kind === 'form'" class="data-card">
                <div class="block-title">{{ block.data.title }}</div>
                <el-form @submit.prevent="submitForm(block)">
                  <el-form-item v-for="field in block.data.fields" :key="field.name" :label="field.label">
                    <el-input
                      v-if="field.type !== 'textarea'"
                      v-model="block.values[field.name]"
                      :type="field.type"
                      :required="field.required" />
                    <el-input v-else v-model="block.values[field.name]" type="textarea" :required="field.required" />
                  </el-form-item>
                  <el-button type="primary" native-type="submit">{{ block.data.submitLabel }}</el-button>
                </el-form>
              </section>

              <section v-else-if="block.kind === 'tool_call'" class="data-card tool-card">
                <div class="block-title">工具调用 · {{ block.data.name }}</div>
                <div class="tool-status">{{ block.data.status === "done" ? "已完成" : "等待执行" }}</div>
                <pre>{{ formatJson(block.data.result || block.data.arguments) }}</pre>
                <el-button v-if="block.data.status !== 'done'" size="small" @click="runTool(block)">执行工具</el-button>
              </section>

              <section v-else-if="block.kind === 'citation'" class="data-card citation-card">
                <div class="block-title">引用来源</div>
                <a :href="block.data.url" target="_blank" rel="noreferrer">{{ block.data.title }}</a>
                <div class="citation-source">{{ block.data.source }}</div>
                <p>{{ block.data.snippet }}</p>
              </section>

              <section v-else-if="block.kind === 'file'" class="data-card file-card">
                <div class="file-icon"><i-ep-document /></div>
                <div class="file-info">
                  <div class="block-title">{{ block.data.name }}</div>
                  <span>{{ block.data.mimeType }} · {{ block.data.size }} B</span>
                </div>
                <a class="file-download" :href="fileDownloadUrl(block)" :download="block.data.name">下载</a>
                <pre>{{ block.data.preview }}</pre>
              </section>

              <section v-else-if="block.kind === 'progress'" class="data-card progress-card">
                <div class="progress-header">
                  <span class="block-title">{{ block.data.task }}</span>
                  <strong>{{ block.data.percent }}%</strong>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: `${block.data.percent}%` }"></div>
                </div>
                <div class="progress-steps">
                  <span v-for="step in block.data.steps" :key="step.label" :class="step.status">{{ step.label }}</span>
                </div>
              </section>
            </div>
          </div>
        </div>

        <el-avatar v-if="msg.role === 'user'" class="avatar user-avatar">我</el-avatar>
      </div>

      <div v-if="isLoading && !hasStreamingMessage" class="message-item assistant">
        <el-avatar class="avatar assistant-avatar">AI</el-avatar>
        <div class="bubble-wrapper">
          <div class="bubble assistant loading-bubble">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>
    </div>

    <div class="input-area">
      <el-input
        v-model="inputText"
        placeholder="输入消息，按 Enter 发送..."
        :disabled="isLoading"
        type="textarea"
        :rows="2"
        resize="none"
        class="message-input"
        @keydown.enter.exact.prevent="sendMessage" />
      <el-button
        type="primary"
        :loading="isLoading"
        :disabled="!inputText.trim() || isLoading"
        class="send-btn"
        size="large"
        @click="sendMessage">
        <el-icon v-if="isLoading"><i-ep-loading /></el-icon>
        <el-icon v-else><i-ep-promotion /></el-icon>
        {{ isLoading ? "回复中..." : "发送" }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import DOMPurify from "dompurify";
import { marked } from "marked";
import { computed, nextTick, reactive, ref } from "vue";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  blocks: UiBlock[];
}

interface UiBlock {
  id: string;
  kind: string;
  data: Record<string, any>;
  values: Record<string, string>;
}

interface ChartItem {
  label: string;
  value: number;
}

interface StreamEvent {
  type?: string;
  component?: string;
  props?: Record<string, any>;
  id?: string;
  phase?: string;
  [key: string]: any;
}

const messages = ref<Message[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const messageListRef = ref<HTMLElement>();
const hints = ["图表", "表单", "工具", "引用", "文件", "进度"];

const hasStreamingMessage = computed(() => messages.value.some((message) => message.streaming));

function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(marked.parse(content) as string);
}

function chartHeight(value: number, items: ChartItem[]): number {
  const max = Math.max(...items.map((item) => item.value), 1);
  return Math.max((value / max) * 100, 4);
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function fileDownloadUrl(block: UiBlock): string {
  const mimeType = block.data.mimeType || "text/plain";
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(block.data.preview || "")}`;
}

function submitForm(block: UiBlock) {
  ElMessage.success(`已提交${block.data.title}`);
}

function runTool(block: UiBlock) {
  block.data.status = "done";
  block.data.result = { success: true, message: "工具执行完成" };
  ElMessage.success(`工具 ${block.data.name} 执行完成`);
}

function appendStreamEvent(message: Message, event: StreamEvent) {
  if (event.type === "ui" && event.component && event.props) {
    message.blocks.push({
      id: `ui-${message.blocks.length}-${Date.now()}`,
      kind: event.component,
      data: event.props,
      values: {},
    });
    return;
  }

  if (event.type === "tool_call" && event.id) {
    const existing = message.blocks.find((block) => block.id === `tool-${event.id}`);
    if (existing) {
      existing.data.status = event.phase === "result" ? "done" : "running";
      if (event.result) existing.data.result = event.result;
      return;
    }

    message.blocks.push({
      id: `tool-${event.id}`,
      kind: "tool_call",
      data: {
        name: event.name,
        arguments: event.arguments,
        result: event.result,
        status: event.phase === "result" ? "done" : "running",
      },
      values: {},
    });
    return;
  }

  if (["citation", "file", "progress"].includes(event.type ?? "")) {
    message.blocks.push({
      id: `${event.type}-${message.blocks.length}-${Date.now()}`,
      kind: event.type ?? "unknown",
      data: event,
      values: {},
    });
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
}

function sendHint(hint: string) {
  inputText.value = hint;
  sendMessage();
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  inputText.value = "";
  isLoading.value = true;
  messages.value.push({ role: "user", content: text, blocks: [] });

  const aiMessage = reactive<Message>({
    role: "assistant",
    content: "",
    streaming: true,
    blocks: [],
  });
  messages.value.push(aiMessage);
  scrollToBottom();

  try {
    const response = await fetch("http://localhost:3000/chat-md/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok || !response.body) {
      throw new Error("请求失败");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as StreamEvent;
          if (parsed.type === "chunk" && parsed.content) {
            aiMessage.content += parsed.content;
            scrollToBottom();
          } else if (parsed.type === "done") {
            aiMessage.streaming = false;
          } else {
            appendStreamEvent(aiMessage, parsed);
            scrollToBottom();
          }
        } catch {
          // 忽略不完整的 SSE 数据
        }
      }
    }
  } catch {
    aiMessage.content = "抱歉，连接 Markdown SSE 服务失败，请确认后端已启动（http://localhost:3000）。";
    aiMessage.streaming = false;
    ElMessage.error("请求失败，请确认后端服务已启动");
  } finally {
    aiMessage.streaming = false;
    isLoading.value = false;
    scrollToBottom();
  }
}
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 16px;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #909399;
  gap: 12px;
  padding: 60px 0;
}

.empty-hint p {
  margin: 0;
  font-size: 15px;
}

.hint-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.hint-tag {
  cursor: pointer;
}

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.message-item.user {
  justify-content: flex-end;
}

.avatar {
  flex-shrink: 0;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.assistant-avatar {
  background: linear-gradient(135deg, #409eff 0%, #36cfc9 100%);
}

.user-avatar {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.bubble-wrapper {
  max-width: calc(100% - 80px);
}

.bubble {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
  white-space: pre-wrap;
}

.bubble.user {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.assistant {
  background: #f5f7fa;
  color: #303133;
  border: 1px solid #ebeef5;
  border-bottom-left-radius: 4px;
}

.markdown-body {
  white-space: normal;
}

:deep(.markdown-body > :first-child) {
  margin-top: 0;
}

:deep(.markdown-body > :last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body pre) {
  overflow-x: auto;
  padding: 12px;
  color: #e5e7eb;
  background: #1f2937;
  border-radius: 8px;
}

:deep(.markdown-body code) {
  padding: 2px 4px;
  background: #e5e7eb;
  border-radius: 4px;
}

:deep(.markdown-body pre code) {
  padding: 0;
  background: transparent;
}

:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  text-align: left;
}

.ui-block {
  margin-top: 14px;
}

.data-card {
  padding: 14px;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
}

.block-title {
  margin-bottom: 10px;
  color: #303133;
  font-weight: 600;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  height: 180px;
  padding: 12px 8px 0;
  border-bottom: 1px solid #dcdfe6;
}

.chart-column {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-width: 40px;
}

.chart-value,
.chart-label {
  color: #606266;
  font-size: 12px;
  white-space: nowrap;
}

.chart-bar-track {
  display: flex;
  align-items: flex-end;
  flex: 1;
  width: 100%;
  max-width: 42px;
  margin: 4px 0;
}

.chart-bar {
  width: 100%;
  min-height: 4px;
  background: linear-gradient(180deg, #36cfc9, #409eff);
  border-radius: 5px 5px 0 0;
}

.tool-card pre,
.file-card pre {
  max-height: 160px;
  margin: 10px 0;
  overflow: auto;
  padding: 10px;
  color: #374151;
  background: #f5f7fa;
  border-radius: 6px;
  white-space: pre-wrap;
}

.tool-status,
.citation-source,
.file-info span {
  color: #909399;
  font-size: 12px;
}

.citation-card a,
.file-download {
  color: #409eff;
}

.citation-card p {
  margin: 8px 0 0;
  color: #606266;
  font-size: 13px;
}

.file-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.file-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 7px;
}

.file-info {
  flex: 1;
  min-width: 140px;
}

.file-info .block-title {
  margin-bottom: 2px;
}

.file-card pre {
  flex-basis: 100%;
  margin-bottom: 0;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.progress-header strong {
  color: #409eff;
}

.progress-track {
  height: 8px;
  margin: 12px 0;
  overflow: hidden;
  background: #ebeef5;
  border-radius: 99px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #36cfc9, #409eff);
  border-radius: inherit;
  transition: width 0.3s ease;
}

.progress-steps {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #c0c4cc;
  font-size: 12px;
}

.progress-steps .done,
.progress-steps .running {
  color: #409eff;
}

.cursor {
  display: inline-block;
  color: #409eff;
  animation: blink 0.8s step-end infinite;
}

.input-area {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.message-input {
  flex: 1;
}

:deep(.message-input .el-textarea__inner) {
  border-radius: 12px;
  resize: none;
  font-size: 15px;
  padding: 10px 14px;
}

.send-btn {
  height: 56px;
  padding: 0 24px;
  border-radius: 12px;
  font-size: 15px;
}

.loading-bubble {
  display: flex;
  gap: 6px;
  padding: 14px 20px;
}

.dot {
  width: 8px;
  height: 8px;
  background: #909399;
  border-radius: 50%;
  animation: bounce 1.2s ease-in-out infinite;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}
.dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  40% {
    transform: translateY(-8px);
    opacity: 1;
  }
}
</style>
