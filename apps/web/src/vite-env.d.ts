/// <reference types="vite/client" />
/// <reference types="unplugin-vue-router/client" />

import "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    /** Requires an authenticated local Core workspace. */
    requiresWorkspace?: boolean;
    /** Requires a Core plugin to be installed and enabled. */
    requiresPlugin?: string;
  }
}

interface ImportMetaEnv {
  readonly VITEST?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
