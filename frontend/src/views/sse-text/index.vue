<template>
  <div class="app-layout">
    <AppHeader title="AI 对话助手" badge="SSE 流式传输" />

    <el-main class="app-main">
      <ChatWindow />
    </el-main>
  </div>
</template>

<script setup lang="ts">
import ChatWindow from "./components/ChatWindow.vue";
</script>
