/** 插件邮箱绑定业务错误 */
export class PluginBindEmailError extends Error {
  constructor(code, status = 400, payload = {}) {
    super(code)
    this.code = code
    this.status = status
    this.payload = payload
  }
}

// handlePluginBindEmail 已迁移至 bindEmailSubscriber.js
// 此处仅保留 PluginBindEmailError 供订阅者使用
