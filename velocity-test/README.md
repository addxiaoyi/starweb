# 本地 Velocity 联调目录

**仓库总览**（网站、皮肤站、插件）：见 [`../README.md`](../README.md)。

## 简约配置入口

优先走仓库根的自动生成链路：

```bash
npm run config:doctor
```

会生成 `velocity-test/.env.velocity.generated`。`start-velocity.ps1` / `start-velocity.sh` 已改为自动加载：

- `.env.velocity.generated`
- `.env.velocity`

所以自动生成值会先落底，手工 `.env.velocity` 可以继续覆盖。

这里也要明确风险：`velocity-test/.env.velocity` 这类 legacy 覆盖层如果残留旧地址、旧密钥、旧端口，就会让实际联调结果偏离 `tools/starmc-simple-config.env`。排障时先重跑 `npm run config:doctor`，再核对覆盖层。

如果你只想单独检查配置而不启动代理：

```bash
npm run config:lint
```

## 要求

- **Java**：与所选 **Velocity** 大版本一致——**3.4.x 代理用 Java 17+**；**3.5.x 代理用 Java 21+**。插件 jar：默认 `mvn package` 为 **17 + 3.4 API**；`mvn -Pvelocity35 package` 为 **21 + 3.5 API**。
- **构建匹配**：3.4.x 代理请配合默认构建产物；3.5.x 代理请使用 `mvn -Pvelocity35 package` 生成的插件 jar，避免 Java 与 Velocity API 主版本错配。
- **Velocity**：从 [papermc.io/downloads/velocity](https://papermc.io/downloads/velocity) 下载对应主线，将 `velocity*.jar` 放在本目录。
- **仅需一个认证插件**：将 `../velocity-limbo-auth/target/StarVelocity-*.jar` 复制到 `plugins/`。本插件已内含原 LimboAPI 全部实现，**不要**再安装独立的 LimboAPI 插件。

## 更新插件 jar

在仓库根目录或 `velocity-limbo-auth` 下执行 `mvn -U package`（或针对 3.5 代理：`mvn -U -Pvelocity35 package`）后：

- Windows：`.\copy-plugin.ps1`；3.5 代理使用 `.\copy-plugin.ps1 -Variant velocity35`
- Linux / macOS：`chmod +x copy-plugin.sh && ./copy-plugin.sh`；3.5 代理使用 `./copy-plugin.sh velocity35`

会将对应的 `../velocity-limbo-auth/target/StarVelocity-*.jar` 复制到本目录 `plugins/`，并清理旧的 StarVelocity/Velocity-Limbo-Auth JAR（与 `plugins/starvelocity/` 配置目录并存）。

## 启动

本目录需自行放入下载的 `velocity*.jar`（与 `velocity.toml` 同级）。

- **Windows（PowerShell）**：`.\start-velocity.ps1`
- **Linux / macOS**：`chmod +x start-velocity.sh && ./start-velocity.sh`
- **手动**：`java -Xms512M -Xmx512M -jar velocity-xxx.jar`

代理配置见 `velocity.toml`（端口、下游服务器等）。生产向 Paper 转发示例见同目录 `velocity.prod.example.toml`（`modern` forwarding、`try`、`forced-hosts` 模板）。

## 受管 Paper 后端状态

推荐用 helper 管理本地真实后端：

```bash
# 仓库根执行
node velocity-test/tools/paper-backend-helper.mjs up --json --wait-ms 120000
node velocity-test/tools/paper-backend-helper.mjs status --json
node velocity-test/tools/paper-backend-helper.mjs down --json

# velocity-test 目录执行
node tools/paper-backend-helper.mjs up --json --wait-ms 120000
```

`status --json` 的 `instances[*].pidState` 含义：

- `running`：PID 与 jar 路径匹配，进程仍存活。
- `stale_dead`：pid 文件指向的进程已退出。
- `stale_mismatch`：PID 仍存在，但不再是该 helper 拉起的 Paper 进程（例如 PID 复用或手工替换进程）。
- `missing`：无 pid 文件记录。

helper 发现 `stale_dead` / `stale_mismatch` 时会自动清理对应 `.paper.pid.json`，避免后续状态读取被旧 pid 干扰。

## Velocity 回归 / 安全相关自检（本仓库已跑通 3.5.x 示例）

- **3.5.x** 示例构建：`velocity-3.5.0-SNAPSHOT-*.jar`，见 [Paper Velocity 下载页](https://papermc.io/downloads/velocity)；若使用 **3.4.x**，请改用 **Java 17** 与 **`mvn package`** 产出的插件 jar。
- 在本目录放置 `velocity*.jar` 后执行 `.\copy-plugin.ps1` 再启动，预期日志：**无 `ERROR` / `Couldn't pass ProxyInitializeEvent`**，且出现 `[VLA] startup complete`；正常时 **`limboReady=true`**（Limbo 初始化失败时见 `config.yml` 顶部「降级」说明）。
- 下列 **WARN** 属于**配置风险**（非代理崩溃），生产环境务必处理：
  - `offline-mode`：伪造账号风险，勿在生产长期关闭正版验证且无其它身份源。
  - `device-fingerprint-salt` / `http-api.api-key`：占位或未配置时，设备指纹与 HTTP 管理面易被滥用；见 `plugins/starvelocity/config.yml`。
- 活动配置目录只有 `plugins/starvelocity/`。历史 `plugins/velocity-limbo-auth/` 已归档到 `archived-external-plugins/legacy-config-velocity-limbo-auth/`，避免 Velocity 启动时误读旧插件数据目录。

## HTTP API 安全自检（漏洞/配置回归）

代理已启动且 HTTP API 在监听后（默认 `127.0.0.1:8090`，见 `plugins/starvelocity/config.yml` 的 `http-api`）：

- **Windows**：`.\http-api-security-check.ps1`  
  脚本会自动读取 `velocity-test/.env.velocity.generated` 和 `velocity-test/.env.velocity`，并优先使用 `VLA_HTTP_API_KEY`（兼容旧的 `VLA_API_KEY`）。  
  可选：`$env:VLA_HTTP_API_KEY="与 config 中 api-key 一致"` 后再运行，会多测「带密钥访问 Prometheus」。
- **Linux / macOS**：`chmod +x http-api-security-check.sh && ./http-api-security-check.sh`  
  脚本同样会自动读取 `velocity-test/.env.velocity.generated` 和 `velocity-test/.env.velocity`，并优先使用 `VLA_HTTP_API_KEY`（兼容旧的 `VLA_API_KEY`）。  
  可选：`export VLA_HTTP_API_KEY='...'` 同上。
- 预期：无 Key 时 `/v1/metrics/prometheus`、`/v1/user/exists` 等为 **401**；`/v1/health` 为 **200**，数据库异常时允许返回 **503**。

其他加固项（需在 `config.yml` 中配置）：`http-api.bind-address` 仅绑定内网、`allow-writes` 默认保持 false、`write-security`（IP 白名单/HMAC）在开启写接口时使用。

## 兼容性 / 压测 / 模拟探针

`tools/vla-probe/` 提供本地防御性探针：

- 仓库根 `npm run probe:http`：验证 `/v1/health` 公开、敏感接口无 Key 返回 401、带 Key 指标接口可用。
- 仓库根 `npm run probe:compat`：用 `mineflayer` 模拟客户端走注册/登录/设备绑定提示。
- 仓库根 `npm run probe:load`：批量模拟客户端连接，做本机容量烟测。
- 仓库根 `npm run probe:load:auth`：批量模拟客户端，自动完成注册/登录/设备选择，并验证能切到真实 Paper 后端。
- `npm run mock:lobby`：启动一个基于 `minecraft-protocol` 的极简 lobby stub。

这些探针参考开源项目 [PrismarineJS/mineflayer](https://github.com/PrismarineJS/mineflayer) 与 [PrismarineJS/node-minecraft-protocol](https://github.com/PrismarineJS/node-minecraft-protocol)。`mock:lobby` 只能验证 Velocity 能转发到一个协议 stub；它不是完整 Paper 服务端，不能替代真实后端兼容性验收。

现在 `tools/vla-probe` 会自动读取：

- `velocity-test/.env.velocity.generated`
- `velocity-test/.env.velocity`
- `velocity-test/velocity.toml`

因此常见本地测试已经不需要重复手工导出 `VLA_HTTP_API_KEY`（旧名 `VLA_API_KEY` 仍兼容）、`VLA_MC_HOST`、`VLA_MC_PORT`。

如果要验证 `forced-hosts` / `resume-original` / 不同入口主机名带来的切服差异，现在还可以额外设置 `VLA_MC_FAKE_HOST`。探针会继续连接本地 `VLA_MC_HOST:VLA_MC_PORT`，但握手里发给 Velocity 的 hostname 会改成这个值。当前测试用 `velocity.toml` 已内置：

- `lobby.local` -> `lobby`
- `factions.local` -> `factions`
- `minigames.local` -> `minigames`

例如：

```powershell
$env:VLA_MC_FAKE_HOST="factions.local"
npm run probe:compat
Remove-Item Env:VLA_MC_FAKE_HOST
```

成功时不要只看探针 `spawned`，还要看代理和目标 Paper 日志是否一致。以 `factions.local` 为例，期望看到：

```text
[VLA] auth handoff forced-host candidates ... virtualHost=factions.local targets=[factions]
[server connection] <probe-user> -> factions has connected
```

对应的运行证明见 [`../docs/STAR_VELOCITY_HANDOFF_VALIDATION_2026-06-10.md`](../docs/STAR_VELOCITY_HANDOFF_VALIDATION_2026-06-10.md)。

但要区分用途：

- 仓库根 `npm run probe:http` 可以独立做 HTTP API 面自检
- 仓库根 `npm run probe:compat`、`npm run probe:load` 与 `npm run probe:load:auth` 现在默认要求真实后端已就绪

具体来说，`compat` / `load` / `load:auth` 会先检查：

- `VLA_REAL_BACKEND_TARGETS`，或
- `velocity.toml` 的 `[servers]`

解析出的目标是否可达，并拒绝把 `VLA mock lobby` 视为正式后端。只有显式设置 `VLA_SKIP_REAL_BACKEND_CHECK=1` 时，才会跳过这道前置检查。

从现在开始，若前置检查发现真实后端不可达，探针会默认尝试自动调用受管后端 helper：

- `node velocity-test/tools/paper-backend-helper.mjs up --json --wait-ms 120000`

自动拉起后会再复检一次后端可达性。可用环境变量控制：

- `VLA_REAL_BACKEND_AUTO_UP=0`：关闭自动拉起（保留仅检查模式）。
- `VLA_REAL_BACKEND_AUTO_UP_WAIT_MS=120000`：自动拉起等待时长（毫秒）。

真实兼容性验收建议：

1. 下载并启动 [PaperMC/Paper](https://github.com/PaperMC/Paper) 后端，端口对齐 `velocity.toml` 的 `[servers]`，默认 `127.0.0.1:30066`。
2. 运行 `.\real-backend-check.ps1`（Linux/macOS: `./real-backend-check.sh`）确认后端端口可达。
3. 启动 Velocity 后回到仓库根执行 `npm run probe:compat`、`npm run probe:load` 与 `npm run probe:load:auth`，并同时观察 `/v1/metrics/prometheus`、Velocity 日志和后端日志。

`probe:load` 与 `probe:load:auth` 的区别：

- `probe:load` 默认使用轻量协议客户端，重点看连接、登录节流、Limbo 接入和基础承载；它不会自动提交密码。
- `probe:load:auth` 默认设置 `VLA_LOAD_AUTH=true`，使用 `mineflayer` 自动输入密码和“不绑定”，用于验证并发注册/登录/切后端；默认要求 **100% 客户端进入真实 Paper 后端 play 阶段**。
- 本机同 IP 压测容易触发 Velocity 登录节流；需要更稳定的完整认证压测时可调大 `VLA_LOAD_RAMP_MS`，例如 PowerShell：`$env:VLA_LOAD_RAMP_MS='5000'; npm run probe:load:auth`。
- 如果你只想把“部分客户端成功进后端”当作烟测，可以显式降低 `VLA_LOAD_MIN_BACKEND_RATIO`，例如 `$env:VLA_LOAD_MIN_BACKEND_RATIO='0.5'`；正式回归建议保持默认 `1`。

`probe:compat` 与 `probe:load` 的输出重点看这几块：

- `phase`：当前停在哪个阶段，例如 `limbo_play_joined`、`auth_success`、`backend_handoff_started`。
- `diagnosis.category`：当前归类出的故障类别。
- `diagnosis.summary`：一句话摘要。
- `diagnosis.guide`：探针给出的排查顺序，包含优先看哪边日志、下一步检查什么。
- `recentEvents`：最近的关键事件，能看出是否收到了注册/登录提示、是否已经开始切后端。
- `sampleClients`：仅 `probe:load` 有，用来抽样看哪些客户端停在什么阶段。

### 重点诊断类别

#### `backend_handoff_started_no_backend_packets`

含义：

- 探针已经看到 `start_configuration`，说明认证流程已经完成，并且代理至少开始了“切真实后端”。
- 但之后没有收到任何来自真实后端的 play 数据包，所以问题通常已经不在“是否收到注册提示”，而是在 **Velocity -> Paper 连通 / 转发 / 配置阶段交接**。

下一步先看哪里：

1. 先看 `velocity-test/logs/latest.log`  
   按 probe 用户名检索，确认是否出现“已开始切服”“已连接到后端”“被后端踢出”之类记录。
2. 再看目标后端日志  
   如果你用的是本仓库脚本拉起的受管 Paper，通常是 `velocity-test/.paper-runtime/instances/<server>/logs/latest.log`。  
   如果你用的是自己维护的 Paper，请直接看你自己的后端日志。

怎么解读两边日志：

- **Velocity 有切服记录，但 Paper 完全没有该用户名的加入记录**：优先排查 `velocity.toml [servers]` 目标、后端存活、端口、网络可达性。
- **Paper 已有加入记录，但紧接着报 configuration / protocol / forwarding / unexpected packet 异常**：优先排查 Limbo 到真实后端的交接、协议兼容或转发配置。

#### `joined_limbo_without_auth_progress`

含义：

- 客户端已经进入 Limbo/play。
- 但没有继续推进到注册/登录提示、认证成功或后端切换。
- 这说明故障点通常还在 **Limbo / 插件认证提示 / 前置风控**，而不是 Paper 后端。

下一步先看哪里：

1. 先看 `velocity-test/logs/latest.log`
2. 对照探针输出里的 `recentEvents` 与 `lastMessage`

怎么解读：

- **`recentEvents` 里没有任何 chat 事件**：优先怀疑插件没有发出认证提示，或者当前提示文案已经变化，导致探针分类规则没识别出来。
- **已经有 chat，但长时间停在 `limbo_play_joined`**：优先看是否被限流、设备绑定前置逻辑、会话保护或其它 Limbo 侧流程拦住。
- **这时一般不必先看 Paper 日志**，因为还没有明确证据表明连接已经开始切到真实后端。

#### `authenticated_backend_reached`

含义：

- `probe:load:auth` 已自动完成注册/登录、设备绑定选择，并达到当前 `VLA_LOAD_MIN_BACKEND_RATIO` 要求。
- 这是批量认证链路通过的正向类别。

下一步看哪里：

1. 按 `sampleClients` 里的用户名查看 `velocity-test/logs/latest.log`，确认有 `auth handoff` 与 `server connection -> lobby has connected`。
2. 查看 `velocity-test/.paper-runtime/instances/<server>/logs/latest.log`，确认没有 `KnownPacks`、`Unexpected request`、configuration/protocol 异常。

#### `authenticated_backend_partial`

含义：

- `probe:load:auth` 已经有客户端完整进入真实 Paper 后端，但数量低于当前 `VLA_LOAD_MIN_BACKEND_RATIO`。
- 默认 `VLA_LOAD_MIN_BACKEND_RATIO=1`，所以 2 个客户端只成功 1 个会被视为失败，而不是“勉强通过”。

处理：

- 先调大 `VLA_LOAD_RAMP_MS` 到 `5000` 或更高，排除本机同 IP 登录节流。
- 再看 `sampleClients.reasonText`、`terminalCounts` 与 Velocity 日志，判断失败客户端是握手阶段断开、被限流，还是后端协议异常。
- 只有做普通 smoke 时才降低 `VLA_LOAD_MIN_BACKEND_RATIO`；完整认证压测应保持 100%。

#### `prelogin_throttled_or_closed`

含义：

- 一批客户端在进入 Limbo/play 前断开。
- 常见原因是本机同 IP ramp 过快触发 Velocity 登录节流，或探针结束时还有客户端停在登录阶段。

处理：

- 先把 `VLA_LOAD_RAMP_MS` 调到 `3000` 到 `5000` 再重跑。
- 生产环境不要为了压测关闭防刷；测试环境如需极限压测，可单独准备放宽节流的 Velocity 配置。

#### `stalled_in_auth_prompts`

这个类别主要出现在 `probe:load`：

- `load` 默认不会自动提交密码，它更偏向接入、限流和 Limbo 承载烟测。
- 所以如果大多数客户端停在注册/登录提示阶段，这本身不等于完整认证链路有 bug。
- 要验证“注册/登录 -> 设备绑定 -> 转后端 -> spawn”整条链路，应优先跑 `npm run probe:compat` 或 `npm run probe:load:auth`。

## 配置验收检查表（对照当前 `config.yml`）

`plugins/starvelocity/config.yml` 已与插件源码中的 **完整默认模板** 对齐（含 `http-api`、`skin`、`database` 等）；占位密钥与默认关闭项仍须按环境修改。上线前逐项勾选：[`配置验收检查表.md`](./配置验收检查表.md)。插件与网站的边界说明见 [`../velocity-limbo-auth/开发清单与网站对接全流程.md`](../velocity-limbo-auth/开发清单与网站对接全流程.md)。
