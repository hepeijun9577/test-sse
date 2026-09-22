import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/sse-text",
    },
    {
      path: "/sse-text",
      name: "sse-text",
      component: () => import("../views/sse-text/index.vue"),
    },
    {
      path: "/sse-md",
      name: "sse-md",
      component: () => import("../views/sse-md/index.vue"),
    },
  ],
});

export default router;
