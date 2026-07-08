/** 开发环境控制台输出；生产构建仍由 Vite esbuild `drop: ['console']` 剔除。 */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

export function devWarn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
}
