<template>
  <div class="agent-page">
    <AppHeader
      title="Agent 工作台"
      badge="DeepSeek · SSE"
      background="linear-gradient(135deg, #0f766e 0%, #155e75 100%)" />

    <el-main class="agent-main">
      <section class="agent-intro">
        <div>
          <p class="eyebrow">M2 / TOOL CALLING</p>
          <h1>和 Agent 开始一次可观察的对话</h1>
          <p class="description">Agent 会先判断是否需要 calculator，再把工具结果交给 DeepSeek 生成最终回答。</p>
        </div>
        <el-tag :type="statusType" effect="plain">{{ statusText }}</el-tag>
      </section>

      <section ref="messageListRef" class="message-list">
        <div v-if="messages.length === 0" class="empty-state">
          <div class="empty-mark">01</div>
          <h2>先给 Agent 一个目标</h2>
          <p>例如：请用三句话解释 Agent 和普通聊天机器人的区别。</p>
        </div>

        <article v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
          <div class="message-label">{{ message.role === "user" ? "YOU" : "AGENT" }}</div>
          <div class="message-content">
            <span>{{ message.content }}</span>
            <span v-if="message.streaming" class="cursor">▋</span>
            <div v-if="message.activities?.length" class="tool-events">
              <div v-for="activity in message.activities" :key="activity" class="tool-event">{{ activity }}</div>
            </div>
          </div>
        </article>
      </section>

      <form class="composer" @submit.prevent="sendMessage">
        <el-input
          v-model="inputText"
          :disabled="isLoading"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="告诉 Agent 你想完成什么..."
          aria-label="Agent message" />
        <el-button type="primary" native-type="submit" :loading="isLoading" :disabled="!inputText.trim() || isLoading">
          {{ isLoading ? "处理中" : "发送给 Agent" }}
        </el-button>
      </form>
    </el-main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from "vue";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  activities?: string[];
}

const messages = ref<Message[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const status = ref<"idle" | "running" | "complete" | "error">("idle");
const messageListRef = ref<HTMLElement>();

const statusText = computed(() => {
  if (status.value === "running") return "执行中";
  if (status.value === "complete") return "已完成";
  if (status.value === "error") return "需要配置 API Key";
  return "等待输入";
});

const statusType = computed(() => {
  if (status.value === "error") return "danger";
  if (status.value === "complete") return "success";
  return "info";
});

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  });
}

async function sendMessage() {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  inputText.value = "";
  isLoading.value = true;
  status.value = "running";
  messages.value.push({ role: "user", content: text });
  const agentMessage = reactive<Message>({ role: "assistant", content: "", streaming: true, activities: [] });
  messages.value.push(agentMessage);
  scrollToBottom();

  try {
    const response = await fetch("http://localhost:3000/agent/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    if (!response.ok || !response.body) throw new Error("Agent 请求失败");

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

        const event = JSON.parse(data) as { type: string; content?: string; message?: string };
        if (event.type === "message_delta") agentMessage.content += event.content ?? "";
        if (event.type === "tool_started")
          agentMessage.activities?.push(`调用工具：${(event as { tool?: string }).tool ?? "未知工具"}`);
        if (event.type === "tool_result") agentMessage.activities?.push("工具执行完成，正在生成回答");
        if (event.type === "tool_error") agentMessage.activities?.push(`工具失败：${event.message ?? "未知错误"}`);
        if (event.type === "agent_error") {
          agentMessage.content = event.message ?? "Agent 请求失败";
          status.value = "error";
        }
        if (event.type === "agent_completed") status.value = "complete";
        scrollToBottom();
      }
    }
  } catch {
    agentMessage.content = "无法连接 Agent 服务，请确认后端已启动。";
    status.value = "error";
    ElMessage.error("Agent 请求失败");
  } finally {
    agentMessage.streaming = false;
    isLoading.value = false;
    scrollToBottom();
  }
}
</script>

<style scoped>
.agent-page {
  min-height: 100vh;
  background: #eef5f3;
  color: #17313b;
}

.agent-main {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: 36px 24px 28px;
}

.agent-intro {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 8px 0 28px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  /* max-width: 620px; */
  margin-bottom: 12px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(30px, 5vw, 52px);
  line-height: 1.05;
  font-weight: 500;
}

.description {
  max-width: 620px;
  margin-bottom: 0;
  color: #5f7478;
}

.message-list {
  min-height: 420px;
  max-height: calc(100vh - 390px);
  overflow-y: auto;
  padding: 28px 0;
  border-top: 1px solid #cfe1dd;
  border-bottom: 1px solid #cfe1dd;
}

.empty-state {
  padding: 76px 20px;
  text-align: center;
  color: #5f7478;
}

.empty-mark {
  margin-bottom: 14px;
  color: #0f766e;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 46px;
}

.empty-state h2 {
  margin-bottom: 8px;
  color: #17313b;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 26px;
  font-weight: 500;
}

.empty-state p {
  margin-bottom: 0;
}

.message {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 18px;
  padding: 20px 0;
}

.message-label {
  padding-top: 4px;
  color: #0f766e;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.message.user .message-label {
  color: #9a6b20;
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
}

.tool-events {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  color: #0f766e;
  font-size: 12px;
}

.tool-event {
  padding-left: 10px;
  border-left: 2px solid #9bc9c0;
}

.message.user .message-content {
  color: #52676b;
}

.cursor {
  color: #0f766e;
  animation: blink 0.8s step-end infinite;
}

.composer {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding-top: 22px;
}

.composer .el-input {
  flex: 1;
}

.composer .el-button {
  min-width: 126px;
  height: 42px;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .agent-main {
    padding: 24px 16px;
  }

  .agent-intro {
    flex-direction: column;
  }

  .message {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 12px;
  }

  .composer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
