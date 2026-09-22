<template>
  <div class="app-layout">
    <AppHeader
      title="Markdown AI 对话"
      badge="SSE + Markdown"
      background="linear-gradient(135deg, #0f766e 0%, #2563eb 100%)" />

    <el-main class="app-main">
      <MarkdownChatWindow />
    </el-main>
  </div>
</template>

<script setup lang="ts">
import MarkdownChatWindow from "./components/MarkdownChatWindow.vue";
</script>
