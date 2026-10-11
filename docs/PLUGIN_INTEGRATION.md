# 网站后端 ↔ VLA/StarX 插件联调对照表

更新时间：2026-07-11

本文档与 `docs/openapi/authx.yaml` 配套，描述 **插件 HTTP（8090）** 与 **网站 API（8787）** 之间的映射。

## 端口与 URL

| 服务 | 默认端口 | 环境变量 |
|------|----------|----------|
| 网站 API | 8787 | `PORT` / `PUBLIC_API_BASE_URL` |
| 插件 stub（皮肤 refresh 入站） | 8788 | `PLUGIN_PORT` |
| VLA HTTP API | 8090 | `AUTHX_PLUGIN_BASE` |

插件 `outbound-webhooks.url` 应指向 **8787**：

- 事件回调：`{PUBLIC_API_BASE_URL}/api/v1/plugin/callback`
- 发送游戏内邮箱验证码：`{PUBLIC_API_BASE_URL}/api/v1/plugin/email-challenge/send`

`tools/starmc-config-lib.mjs` 生成 `velocity-test/.env.velocity.generated` 时会写入 `VLA_WEBHOOK_URL`。

## 插件 → 网站（Webhook 入站）

| 插件配置 | 网站路由 | 验签 |
|----------|----------|------|
| `outbound-webhooks` 通用事件 | `POST /api/v1/plugin/callback` | `X-VLA-Signature` |
| 游戏内邮箱验证码 | `POST /api/v1/plugin/email-challenge/send` | 同上；由网站 SMTP 配置发送 |
| 皮肤桥通知刷新 | `POST /plugin/skin/refresh`（8788 stub 或反代） | `X-Skin-Bridge-Secret` |

## StarX 自动入网（推荐）

不再为每台节点手工录入网站侧 API 地址。管理员在“状态与插件 → StarX 自动入网”生成一个 15 分钟、单次使用的引导令牌，插件只配置：

```yaml
website:
  url: https://star-web.top
  node-id: survival-1
  bootstrap-token: stx_boot_仅首次部署填写
```

插件首次启动调用 `POST /api/v1/plugin/enroll`：

```json
{
  "bootstrapToken": "stx_boot_...",
  "nodeId": "survival-1",
  "platform": "paper",
  "capabilities": ["server.status", "players.snapshot", "skin.refresh"]
}
```

成功响应中的 `credential.token` 只返回一次。插件应写入仅服务账户可读的本地配置并立即清除 `bootstrap-token`。后续调用 `POST /api/v1/plugin/heartbeat`，使用 `Authorization: Bearer stx_node_...`；请求体必须带同一个 `nodeId`。网站只保存 SHA-256 摘要，不能恢复节点凭据。

心跳 JSON 使用以下稳定字段。未知字段不要发送；无数据时使用 `null` 或省略，不要伪造 0 TPS：

```json
{
  "nodeId": "proxy-1",
  "capabilities": ["network.status", "players.snapshot", "server.status", "skin.refresh"],
  "snapshot": {
    "pluginVersion": "1.4.0",
    "minecraftVersion": "1.21.8",
    "onlinePlayers": 12,
    "maxPlayers": 100,
    "tps": 19.92,
    "mspt": 17.4,
    "maintenance": false,
    "servers": [
      {
        "nodeId": "survival-1",
        "name": "原版生存",
        "platform": "paper",
        "minecraftVersion": "1.21.8",
        "status": "online",
        "onlinePlayers": 8,
        "maxPlayers": 80,
        "tps": 19.8,
        "mspt": 18.1,
        "maintenance": false,
        "capabilities": ["server.status", "skin.refresh"]
      }
    ]
  }
}
```

约束：最多 128 个子服；人数非负且不超过 100000；TPS 为 0–100；MSPT 为 0–60000；`status` 只能是 `online`、`offline`、`degraded`、`maintenance`、`unknown`。整份快照校验失败时网站返回 HTTP 400 / `snapshot_invalid`，不会保存半份数据。凭据不存在或节点已撤销返回 HTTP 401；凭据与请求体 `nodeId` 不一致返回 HTTP 403，插件不得把 400/403 误判为需要重新入网。

网站通过 `GET /api/public/plugin-network` 公开 90 秒内的活动节点快照；过期、撤销或未上报快照的节点不会伪装成在线。

### 皮肤与披风增量同步

插件先调用 `POST /api/v1/plugin/skins/manifest`，继续使用节点 Bearer 凭据：

```json
{
  "syncId": "8f04af40-2ec8-4b03-8ef7-6936c761a913",
  "page": 0,
  "pages": 2,
  "entries": [{
    "playerUuid": "8667ba71-b85a-4004-af54-457a9734eed7",
    "playerName": "Steve",
    "skinHash": "64位小写SHA-256",
    "capeHash": null,
    "model": "classic",
    "source": "skinsrestorer",
    "updatedAt": "2026-07-27T00:00:00.000Z",
    "deleted": false
  }]
}
```

每页最多 1000 名玩家，`page` 从 0 开始，`pages` 为本次完整快照的总页数。同一次快照的所有页面必须使用相同 `syncId`。网站先把页面写入节点暂存区，只有所有页面到齐且不存在重复玩家 UUID 时，才会按页序原子替换正式清单；中途失败不会把正式清单截断成最后一页。旧插件不发送分页字段时仍按单页完整快照处理。未完成的暂存清单 15 分钟后过期。

响应 `missingHashes` 只列出当前页面引用且网站尚未保存的纹理。分页提交期间，纹理上传可引用已收到的暂存页面；完整提交后则按正式清单鉴权。插件逐项调用：

```http
POST /api/v1/plugin/textures/{sha256}
Authorization: Bearer stx_node_...
Content-Type: application/json

{"kind":"skin","pngBase64":"..."}
```

网站只接受当前节点清单实际引用的 Hash，并验证二进制 SHA-256、PNG 解码、512 KiB 上限及标准尺寸：皮肤 `64×64`/`64×32`，披风 `64×32`/`64×17`。相同 Hash 全站只保存一次；重复上传安全地复用现有文件。后台通过 `GET /api/admin/plugin-skins/sync-status` 查看每个节点的清单数量、永久归档玩家数、已保存纹理数和最后同步时间。

正式清单表示当前一轮完整快照，网站同时维护按节点和玩家 UUID 索引的永久皮肤归档。玩家下线或后续快照未包含该玩家时，只会从当前清单消失，不会删除永久归档及已上传纹理；只有清单显式发送 `deleted: true` 才删除该玩家的归档引用。Velocity 的纹理源会合并 `starx_users` 中的历史玩家与当前在线玩家，在线记录按 UUID 覆盖旧名称，最多同步 100000 名玩家。因此已经进入账户数据库且 SkinsRestorer 有纹理的离线玩家也会进入后续同步，而不要求其再次上线。

管理员可在后台查看真实最后心跳、撤销节点或轮换凭据。轮换后旧凭据立即失效，撤销后该节点的所有心跳立即被拒绝。

若插件声明 `callbackUrl`，公网部署默认只接受无用户名密码的 HTTP(S) 公网地址。网站与插件位于同一可信内网时，服务端可显式设置 `PLUGIN_ENROLLMENT_ALLOW_PRIVATE=true`；不要在公网实例上启用。网站不会扫描内网寻找插件。

## 网站 → 插件（管理代理）

管理端 `GET /api/admin/authx/bridge-status` 汇总配置、断路器与健康探测。CLI：`npm run plugin:probe`。

网站通过现有 `pluginFetchJson` 管理代理调用 Velocity 已注册的鉴权白名单接口，例如皮肤刷新、踢出玩家、绑定解析和账户管理。该通道使用 StarX API Key 或 VLA HMAC，并带有超时、重试和断路器；不提供任意控制台命令执行接口。节点能力中只有真实可用的白名单能力才应声明，未实现通用命令队列时不得声明 `server.commands`。

### 后台配置公网 / FRP 插件 API

超级管理员可在“状态与插件 → 网站与插件双向主动链路”填写插件暴露后的 API 根地址和 `X-API-Key`。根地址示例：

```text
https://plugin-api.example.com
http://frp.example.com:18789
```

只填写根地址，不要附带 `/v1/health`。网站会使用固定白名单路径：

- `GET /v1/health`：语义健康检查；
- `GET /v1/network/status`：主动获取网络、玩家和后端状态；
- `POST /v1/admin/bridge/ping`：发送有界消息并要求插件回显 nonce；
- 现有管理接口：按业务调用，不接受任意 URL 或任意控制台命令。

保存后配置立即生效，不要求重启网站。网站按后台设置的 5–300 秒间隔主动拉取插件状态；插件仍会独立向网站发送心跳、纹理清单和 HMAC 签名事件。因此任一方向短时中断都不会被另一方向伪装成成功。

生产环境必须配置：

```dotenv
# 至少 32 个 UTF-8 字节；用于加密后台填写的插件 API Key。
PLUGIN_BRIDGE_SECRET_KEY=请使用密码管理器生成的独立随机主密钥
PLUGIN_BRIDGE_POLLING_ENABLED=true
PLUGIN_BRIDGE_POLL_INTERVAL_MS=15000
```

API Key 使用 AES-256-GCM 加密后写入持久化配置。浏览器只会收到“是否配置”和掩码，不会取回明文。缺少或错误的 `PLUGIN_BRIDGE_SECRET_KEY` 会使已保存凭据进入锁定状态，网站不会把密文或字符串 `undefined` 当作可用密钥。轮换主密钥前必须先用旧主密钥解密并重新保存插件 API Key；不要直接替换主密钥后丢弃旧值。

“测试双向链路”会依次验证健康接口、向插件发送无副作用 ACK 消息、再主动读取网络状态。ACK 消息只包含 UUID nonce、最多 256 字符消息和时间戳；插件不会执行消息内容，也不会修改玩家或服务器状态。

FRP 建立后由管理员执行实际验收：

1. 在浏览器后台填写 FRP / 公网根地址及 Velocity 配置中的同一个 `api-key`；
2. 保存后确认密钥状态显示“已加密保存”；
3. 点击“测试双向链路”，确认 health、ACK、fetch 三项均成功；
4. 等待至少两个轮询周期，确认成功请求计数增加；
5. 临时停止 FRP，确认链路显示不可达且不会泄漏密钥；恢复 FRP 后重新测试；
6. 检查插件到网站的心跳和签名事件仍持续工作。

启用 `website-sync` 后，Velocity 把 `/api/public/skin-profile/{username}` 作为优先皮肤源。玩家 `PostLogin` 时以及网站触发皮肤刷新时，Velocity 获取网站档案并生成 Minecraft `textures` 属性，然后同时执行三项操作：更新在线玩家 GameProfile、写入 Velocity 侧 SkinsRestorer、通过固定桥接消息 `proxy.skin.update` 广播到所有已注册后端服。后端 StarX 收到消息后将同一属性写入本服 SkinsRestorer；没有可用玩家载体时消息进入有容量和 TTL 限制的后端邮箱，不依赖玩家在线。该消息是固定协议类型，不是任意命令执行。

### 游戏内应用目录皮肤

StarX 不注册 `/skin`，避免与 SkinsRestorer 冲突。玩家使用：

```text
/sxskin apply <catalogId>
```

该命令只在 `website-sync` 已完成节点注册、节点具有 `skin.refresh` 能力、且命令玩家的 UUID 与游戏名均已绑定到网站账户时可用。Velocity 以节点 Bearer 凭据调用 `POST /api/v1/plugin/skins/apply`；网站只保存该绑定角色的目录选择，随后 Velocity 按上述固定皮肤桥接流程刷新代理和已连接子服。`/sxskin`（无参数）仅重新拉取当前角色已保存的网站皮肤。

要实现每个后端服的本地持久化，各后端必须同时安装 StarX Server 与兼容的 SkinsRestorer。缺少 SkinsRestorer 时，Velocity 仍能给在线玩家设置代理侧 GameProfile，但该后端无法把网站皮肤写入自身存储。

## 公开皮肤档案

`GET /api/public/skin-profile/{username}` — VLA `skin.custom-profile-url` 模板。

该接口无需会话。皮肤选择优先级为：网站用户当前装备且已审核的皮肤/披风，其次是插件永久归档；两者都不存在时返回空档案或 404。插件永久归档可服务尚未绑定网站账户的 Minecraft 玩家，但只有对应 PNG 已成功保存后才会公开。响应固定使用绝对 URL，便于插件直接下载：

```json
{
  "ok": true,
  "username": "Steve",
  "linkedUserId": "site-user-id",
  "textureUrl": "https://star-web.top/uploads/textures/site-user-id/skin-uuid.png",
  "capeUrl": "https://star-web.top/uploads/textures/site-user-id/cape-uuid.png",
  "model": "slim"
}
```

- `textureUrl` 为 `null` 时，插件应保留原版皮肤。
- `capeUrl` 缺失时，插件应保留或清除披风，取决于其自身刷新策略。
- 目录皮肤、自有皮肤、Mojang 同步皮肤均可与单独装备的目录或自有披风组合；待审和驳回资源不会出现在响应中。
- VLA/StarX 的 `skin.custom-profile-url` 使用玩家名占位符时应指向 `https://star-web.top/api/public/skin-profile/{player}`；StarX `WebsiteSkinRepository` 会拼接成 `{base}/{player}.json`，因此 base URL 配到 `https://star-web.top/api/public/skin-profile` 也会被后端兼容处理。

此接口是 StarMC 的轻量同步契约，不是 Blessing Skin Server 的 Yggdrasil API 实现。`authlib-injector`、MultiLogin、CustomSkinManager 或 SkinRestorer 只有在其版本支持该 JSON 契约或配置了相应适配器时才能直接使用；部署前必须针对目标插件版本做联调。

## 可重复的 HTTP 全链路验收

在仓库根目录执行：

```powershell
npm run website:contract:e2e
```

该测试使用真实 Express 路由和临时纹理目录，覆盖引导令牌、首次入网、错误心跳分类、有效心跳、公开网络状态、分页清单原子提交、纹理大小/Hash/PNG 校验、重复上传、公开皮肤档案与纹理下载、凭据轮换以及节点撤销。它不依赖生产数据，也不会写入正式上传目录。
