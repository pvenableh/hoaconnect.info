// Page flags the workspace layout (layouts/auth.vue) reads from definePageMeta.
declare module "#app" {
  interface PageMeta {
    /**
     * A full-viewport page inside the workspace shell (Channels): the page is
     * h-dvh and scrolls internally, the footer hides, and the dock stays.
     */
    immersive?: boolean;
  }
}

export {};
