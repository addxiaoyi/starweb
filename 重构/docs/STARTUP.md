# Startup guide

当前推荐启动路径已经切换到仓库根的统一配置链路。

## 推荐流程

1. 在仓库根初始化并生成配置：

```bash
npm run config:doctor
```

2. 启动后端：

```bash
cd backend
npm run dev
```

3. 启动前端：

```bash
cd ..
npm run dev
```

如果你需要单命令拉起网站前后端，也可以在 `重构/` 下运行 `scripts/start-all.sh` 或 `scripts/start-all.ps1`。它们现在会先执行仓库根 `npm run config:doctor`，然后按生成配置中的固定端口启动；端口冲突时会直接失败，不再自动改用其它端口。

## Windows PowerShell

```powershell
cd ..
npm run config:doctor
cd 重构\backend
npm run dev
cd ..\重构
npm run dev
```

## 运行要求

- Node.js `20.19.0+`
- npm

## 旧脚本说明

`scripts/start-all.sh` 与 `npm run dev:all:win` 仍保留，但它们已经改为固定配置启动包装器，不再是旧的自动选端口模型。当前前后端联调、插件回调、Vite 代理目标都应优先以根配置生成链路为准。

如果实际启动结果和 `tools/starmc-simple-config.env` 不一致，优先检查本地 `.env` / `.env.local` / `.env.development*` 覆盖文件是否仍带着旧值。
