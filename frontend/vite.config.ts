import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";

const elementPlusComponents: Record<string, string> = {
  ElAvatar: "avatar",
  ElButton: "button",
  ElForm: "form",
  ElFormItem: "form",
  ElHeader: "container",
  ElIcon: "icon",
  ElInput: "input",
  ElMain: "container",
  ElTag: "tag",
};

function elementPlusResolver() {
  return {
    type: "component" as const,
    resolve(name: string) {
      const componentPath = elementPlusComponents[name];
      if (!componentPath) return;

      return {
        name,
        from: `element-plus/es/components/${componentPath}/index`,
        sideEffects: `element-plus/es/components/${componentPath}/style/css`,
      };
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 8111,
  },
  plugins: [
    vue(),
    AutoImport({
      imports: [
        "vue",
        "vue-router",
        {
          "element-plus/es/components/message/index": ["ElMessage"],
        },
      ],
      dts: "src/auto-imports.d.ts",
    }),
    Components({
      resolvers: [elementPlusResolver(), IconsResolver({ enabledCollections: ["ep"] })],
      dts: "src/components.d.ts",
    }),
    Icons({ autoInstall: false }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("element-plus")) return "element-plus";
          if (id.includes("marked") || id.includes("dompurify")) return "markdown";
          if (id.includes("vue-router")) return "vue-router";

          return "vendor";
        },
      },
    },
  },
});
