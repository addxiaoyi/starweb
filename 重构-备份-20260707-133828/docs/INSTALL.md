# 安装检查清单

新机器初始化时，优先按“简约配置 + `config:doctor`”链路执行，不把手工 `.env` 覆盖层当默认入口。

## 前置要求

- Node.js `20.19.0+`
- npm

## 需要准备的文件

- 仓库源码
- `tools/starmc-simple-config.env`
- 各模块 `.env.example` 已在仓库内，无需额外复制
- 如果你明确要保留覆盖层，再额外准备本机的 `.env` / `.env.local` / `.env.velocity`
- 未提交到 Git 的本地数据目录

## 推荐初始化步骤

### 所有平台

```bash
npm run config:doctor
npm --prefix 重构/backend run dev:simple
npm --prefix 重构 run dev
```

也可以在 `重构/` 目录执行 `scripts/start-all.sh` / `scripts/start-all.ps1`；这两个包装脚本同样会先调用仓库根 `npm run config:doctor`。

## 启动后检查

- 前端默认开发地址通常为 `http://127.0.0.1:5173`
- 后端地址由根配置生成链路决定，默认 `https://www.star-web.top`
- 如果实际行为与 `tools/starmc-simple-config.env` 不一致，优先检查 legacy `.env` 覆盖文件是否仍在生效
- 如果依赖缺失，分别在 `重构/` 和 `重构/backend/` 执行 `npm install`
