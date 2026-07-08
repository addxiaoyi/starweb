# 部署与迁移说明

当前推荐的迁移思路是：以仓库根 `tools/starmc-simple-config.env` 为单一配置源，先执行 `npm run config:doctor` 生成各模块运行配置，再按固定端口启动。现有脚本不再依赖“运行时自动探测端口”。

## 需要复制的内容

- 仓库源码
- `tools/starmc-simple-config.env`
- `重构/backend/.env`，仅当你明确要保留后端覆盖层时才复制
- `重构/.env`、`重构/.env.local` 等前端覆盖层，仅当你明确需要时才复制
- `.runtime/` 目录可选，仅作为运行时工作目录
- 未纳入 Git 的上传目录、数据目录等本地状态

## 新机器部署步骤

1. 安装 Node.js `20.19.0+` 和 npm。
2. 将仓库复制到目标机器。
3. 如果需要保留 legacy `.env` 覆盖层，先确认它们仍与 `tools/starmc-simple-config.env` 一致，再复制到位。
4. 在仓库根执行：

```bash
npm run config:doctor
```

5. 启动整套前后端：

```bash
cd 重构
bash scripts/start-all.sh
```

## Windows 启动

在 Windows PowerShell 中执行：

```powershell
cd 重构
powershell -ExecutionPolicy Bypass -File .\scripts\start-all.ps1
```

## 说明

- `start-all.*` 现在会先回到仓库根执行 `npm run config:doctor`，然后使用生成配置中的固定地址和端口启动前后端。
- 如果固定端口已被占用，脚本会直接报错退出，不会再自动挑选新端口。
- 如果实际行为与简约配置源不一致，优先检查 `重构/backend/.env`、`重构/.env`、`.env.local`、`.env.development.local` 等覆盖层是否仍在生效。
- 日志默认只输出到当前终端；如需留档，请自行做重定向。
