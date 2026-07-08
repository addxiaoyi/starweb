# 最终部署顺序

迁移到新机器时，按下面顺序执行，保持“简约配置 + `config:doctor` 为主入口”的口径一致。

## 1. 安装前置依赖

- Node.js `20.19.0+`
- npm

## 2. 复制文件

复制仓库，以及你确实需要保留的本地配置：

- `tools/starmc-simple-config.env`（推荐主配置入口）
- 前端/后端的手工 `.env` 覆盖文件（如果你确实需要；迁移后若与简约配置源冲突，优先清理这些覆盖层）
- 未纳入版本控制的本地数据目录

## 3. 生成运行配置

```bash
npm run config:doctor
```

## 4. 启动服务

```bash
npm --prefix 重构/backend run dev:simple
npm --prefix 重构 run dev
```

如果希望用统一包装器启动，也可以在 `重构/` 目录执行 `scripts/start-all.sh` 或 `scripts/start-all.ps1`；它们会先回仓库根执行 `npm run config:doctor`。

## 5. 验证

```bash
npm --prefix 重构 run doctor:startup
```

如需联调 Velocity / 插件 HTTP 面，再回到仓库根执行：

```bash
npm run probe:http
```

需要真实后端兼容性或压测时，统一使用仓库根入口：

```bash
npm run probe:compat
npm run probe:load
```

## 6. 停止

在运行中的终端按 `Ctrl+C`。

## 说明

- 不再推荐依赖旧的自动选端口脚本做主启动流程；`start-all.*` 现已改为固定配置启动包装器。
- 当前推荐路径是“根配置生成 + 分别启动前后端”，这样能和插件、皮肤站、回调地址保持一致。
