<template>
  <el-header class="app-header" :style="headerStyle">
    <div class="header-content">
      <div class="logo">
        <el-icon size="24" color="#fff"><i-ep-document /></el-icon>
        <span>{{ title }}</span>
      </div>
      <div class="header-info">
        <el-tag type="success" effect="dark" size="small">{{ badge }}</el-tag>
        <span class="tech-stack">NestJS + Vue3 + Element Plus</span>
      </div>
    </div>
  </el-header>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    badge: string;
    background?: string;
  }>(),
  {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
);

const headerStyle = computed(() => ({
  background: props.background,
}));
</script>
