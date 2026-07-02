# FAQ

## Startup issues

### Q: Frontend or backend does not start.

A: 先在仓库根重新生成配置，再分别启动前后端：

```bash
npm run config:doctor
cd 重构/backend && npm run dev
cd ../重构 && npm run dev
```

Then check whether `node_modules` exists in the repository root and in `backend/`.

### Q: Do I need to edit the scripts after moving the repository?

A: 不需要改路径，但推荐重新执行一次 `npm run config:doctor`，确保生成文件与当前机器环境一致。

## Ports

### Q: Local default ports are what?

A: 前端默认 `5173`，后端默认 `8787`，Velocity 测试 HTTP 默认 `8090`。如需调整，优先改 `tools/starmc-simple-config.env`。

### Q: Can I still use `dev:all` / `dev:all:win`?

A: 可以。它们现在会先执行仓库根 `npm run config:doctor`，再按生成配置里的固定端口启动；如果端口被占用会直接报错，不再自动选别的端口。当前推荐路径仍然是先把 `tools/starmc-simple-config.env` 作为唯一主配置源维护好。

### Q: Why does the actual startup config not match `tools/starmc-simple-config.env`?

A: 通常是 legacy 覆盖文件造成的，例如 `重构/.env`、`.env.local`、`.env.development.local` 或 `重构/backend/.env`。这些文件仍会覆盖生成值；排障时先重新执行 `npm run config:doctor`，再逐个检查覆盖层。

## Where to look first

1. `README.md` for a quick overview
2. `docs/INSTALL.md` for first-time setup
3. `docs/STARTUP.md` for startup details
4. `docs/DEPLOY.md` for migration notes
5. `docs/STOP.md` for shutdown behavior
