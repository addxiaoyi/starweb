# starmc-refactor

StarMC 网站前端与 Node 后端工作区。

## 推荐入口

优先使用仓库根的统一配置链路：

```bash
cd ..
npm run config:doctor
```

然后分别启动：

```bash
cd 重构/backend && npm run dev
cd ../重构 && npm run dev
```

Windows PowerShell：

```powershell
cd ..
npm run config:doctor
cd 重构\backend; npm run dev
cd ..\重构; npm run dev
```

如果你需要一条命令同时拉起前后端，可以继续使用：

```bash
cd 重构
bash ./scripts/start-all.sh
```

或 Windows：

```powershell
cd 重构
powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1
```

但它们现在的行为已经变化：

- 启动前会自动回到仓库根执行 `npm run config:doctor`
- 按生成配置里的固定地址和端口启动
- 如果端口已占用会直接报错，不再自动换端口
- 因此前后端、Vite 代理、插件回调会和简约配置源保持同一套事实

## 运行要求

- Node.js `20.19.0+`
- npm

这不是随意提高门槛。当前前端依赖的 Vite 7 已要求 Node `^20.19.0 || >=22.12.0`，所以旧的 `18+` 说明已经过期。

## 文档入口

- 根配置教程：[`../docs/SIMPLE_CONFIG.md`](../docs/SIMPLE_CONFIG.md)
- 根仓总览：[`../README.md`](../README.md)
- 启动说明：[`docs/STARTUP.md`](./docs/STARTUP.md)
- 安装清单：[`docs/INSTALL.md`](./docs/INSTALL.md)
- 常见问题：[`docs/FAQ.md`](./docs/FAQ.md)

## 说明

- `npm run dev:all` / `npm run dev:all:win` 仍保留为辅助入口，但底层已经切到固定配置启动，不再属于旧的自动选端口模型。
- 本目录前端默认开发端口仍是 `5173`；后端端口与联动地址优先由根配置生成链路控制。
- 如果本地还留有 `.env` / `.env.local` / `.env.development*` 等 legacy 覆盖文件，它们会继续覆盖生成值；当运行结果与 `tools/starmc-simple-config.env` 不一致时，优先检查这些文件是否导致漂移。
