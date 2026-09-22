<template>
  <div class="chat-container">
    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef">
      <div v-if="messages.length === 0" class="empty-hint">
        <el-icon size="48" color="#c0c4cc"><i-ep-chat-dot-round /></el-icon>
        <p>试着发送一条消息，开始 AI 对话吧！</p>
        <div class="hint-tags">
          <el-tag v-for="hint in hints" :key="hint" @click="sendHint(hint)" class="hint-tag" effect="plain">{{
            hint
          }}</el-tag>
        </div>
      </div>

      <div v-for="(msg, index) in messages" :key="index" :class="['message-item', msg.role]">
        <!-- 头像 -->
        <el-avatar
          v-if="msg.role === 'assistant'"
          :icon="msg.role === 'assistant' ? 'Cpu' : undefined"
          class="avatar"
          style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          >AI</el-avatar
        >

        <!-- 消息气泡 -->
        <div class="bubble-wrapper">
          <div :class="['bubble', msg.role]">
            <span class="message-text">{{ msg.content }}</span>
            <span v-if="msg.streaming" class="cursor">▋</span>
          </div>
        </div>

        <el-avatar
          v-if="msg.role === 'user'"
          class="avatar"
          style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
          >我</el-avatar
        >
      </div>

      <!-- 加载中指示器 -->
      <div v-if="isLoading && !hasStreamingMessage" class="message-item assistant">
        <el-avatar class="avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">AI</el-avatar>
        <div class="bubble-wrapper">
          <div class="bubble assistant loading-bubble">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputText"
        placeholder="输入消息，按 Enter 发送..."
        :disabled="isLoading"
        type="textarea"
        :rows="2"
        resize="none"
        @keydown.enter.exact.prevent="sendMessage"
        class="message-input" />
      <el-button
        type="primary"
        :loading="isLoading"
        :disabled="!inputText.trim() || isLoading"
        @click="sendMessage"
        class="send-btn"
        size="large">
        <el-icon v-if="isLoading"><i-ep-loading /></el-icon>
        <el-icon v-else><i-ep-promotion /></el-icon>
        {{ isLoading ? "回复中..." : "发送" }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, reactive } from "vue";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const messages = ref<Message[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const messageListRef = ref<HTMLElement>();

const hints = ["你好", "介绍一下自己", "SSE 是什么？", "Hello"];

const hasStreamingMessage = computed(() => messages.value.some((m) => m.streaming));

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

  // 添加用户消息
  messages.value.push({ role: "user", content: text });
  scrollToBottom();

  // 添加 AI 消息占位，用 reactive 包装使直接属性修改也能触发响应式更新
  const aiMsg = reactive<Message>({ role: "assistant", content: "", streaming: true });
  messages.value.push(aiMsg);
  scrollToBottom();

  try {
    const response = await fetch("http://localhost:3000/chat/stream", {
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
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "chunk" && parsed.content) {
              aiMsg.content += parsed.content;
              scrollToBottom();
            } else if (parsed.type === "done") {
              aiMsg.streaming = false;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (error) {
    aiMsg.content = "抱歉，连接服务器失败，请确认后端已启动（http://localhost:3000）。";
    aiMsg.streaming = false;
    ElMessage.error("请求失败，请确认后端服务已启动");
  } finally {
    aiMsg.streaming = false;
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
  box-sizing: border-box;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
  scrollbar-width: thin;
  scrollbar-color: #dcdfe6 transparent;
}

.message-list::-webkit-scrollbar {
  width: 6px;
}
.message-list::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
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
  font-size: 15px;
  margin: 0;
}

.hint-tags {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.hint-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.hint-tag:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
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
  font-size: 13px;
  font-weight: 600;
  color: #fff;
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
  border-bottom-left-radius: 4px;
  border: 1px solid #ebeef5;
}

.cursor {
  display: inline-block;
  animation: blink 0.8s step-end infinite;
  color: #409eff;
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

/* 加载动画气泡 */
.loading-bubble {
  display: flex;
  align-items: center;
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

/* 输入区域 */
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
</style>
