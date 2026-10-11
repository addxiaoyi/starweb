const DEFAULT_WIKI_PAGES = [
  {
    id: 'how-to-join',
    title: '如何进服',
    titleEn: 'How to Join',
    category: '新手指南',
    content: '# 如何进服\n\n欢迎来到 StarMC。请先在服务器状态页确认当前可用入口和客户端版本，再使用下面的游戏地址加入。\n\n## 服务器地址\n\n请选择延迟最低的入口：\n\n    mc.star-mc.top\n    max.star-mc.top\n\n## 版本要求\n\n不同节点的兼容版本可能不同，以服务器状态页公布的信息为准。首次进服前，建议先完成网站注册并在个人中心绑定正版 ID。',
  },
  {
    id: 'basic-rules',
    title: '基本规则',
    titleEn: 'Basic Rules',
    category: '新手指南',
    content: '# 基本规则\n\n为了给所有人提供舒适的生存环境，请遵守以下规则。\n\n## 严禁作弊\n\n禁止使用作弊客户端、作弊材质包、自动脚本或按键精灵。\n\n## 禁止恶意破坏\n\n未经允许不得破坏他人建筑、偷取箱子物品或在他人领地附近恶意放置方块。\n\n## 友善交流\n\n禁止刷屏、广告、辱骂、人身攻击和引战。遇到违规行为，请使用游戏内 /report 指令或提交工单。',
  },
  {
    id: 'commands',
    title: '常用指令',
    titleEn: 'Common Commands',
    category: '新手指南',
    content: '# 常用指令\n\n以下是生存服中常用的指令。\n\n## 传送与位置\n\n    /spawn          - 返回主城\n    /sethome <名字> - 设置家\n    /home <名字>    - 传送到家\n    /tpa <玩家>     - 请求传送\n    /tpaccept       - 接受传送请求\n    /tpdeny         - 拒绝传送请求\n\n## 领地保护\n\n    /res create <名字> - 创建领地\n    /res add <玩家>    - 授权玩家\n    /res tp <领地名>   - 传送到领地\n    /res remove <名字> - 删除领地\n\n## 经济与交流\n\n    /money            - 查看余额\n    /pay <玩家> <数额> - 转账\n    /msg <玩家> <内容> - 私聊\n    /r <内容>          - 回复私聊',
  },
  {
    id: 'skin-browse',
    title: '浏览与收藏',
    titleEn: 'Browse & Favorite',
    category: '皮肤站',
    content: '# 浏览与收藏\n\n皮肤站目录读取已审核的真实皮肤记录，可按类型、标签、热度或更新时间筛选。\n\n## 收藏皮肤\n\n- 浏览皮肤不需要登录。\n- 收藏、评论和账号资产同步需要先登录。\n- 收藏状态保存在账号中，可在个人中心继续管理。\n- 如果列表无法读取，页面会明确显示连接失败，不会使用示例皮肤或虚构数字。',
  },
  {
    id: 'skin-upload',
    title: '上传与规范',
    titleEn: 'Upload & Rules',
    category: '皮肤站',
    content: '# 上传与规范\n\n上传入口位于皮肤工作室。文件提交后进入审核队列，审核通过前不会出现在公开目录。\n\n## 文件要求\n\n- 使用标准 Minecraft PNG 皮肤纹理，并正确选择 Steve 或 Alex 手臂模型。\n- 标题、介绍和标签应描述作品本身，不得冒充其他作者或重复上传。\n- 不得上传违法、仇恨、色情、侵权或误导其他玩家的内容。\n\n管理员可以驳回或下架违规内容，处理结果以审核记录为准。',
  },
  {
    id: 'skin-apply',
    title: '游戏内应用皮肤',
    titleEn: 'Applying Skins In-game',
    category: '皮肤站',
    content: '# 游戏内应用皮肤\n\n网页端与服务端联动的皮肤系统可以把网站皮肤同步到游戏中。\n\n## 操作步骤\n\n1. 在个人中心的游戏账号页面绑定角色。\n2. 打开皮肤详情页并复制皮肤编号。\n3. 进入服务器后输入下面的指令：\n\n    /sxskin apply <皮肤编号>\n\n应用后会刷新当前代理，并同步到已连接的子服。',
  },
  {
    id: 'auth',
    title: '登录与认证',
    titleEn: 'Authentication',
    category: '账号与安全',
    content: '# 登录与认证\n\n网站支持已配置的账号登录方式。登录成功后会建立网站会话，游戏角色绑定是独立验证流程，不会改变玩家的正版 UUID。\n\n## 账号恢复与邮箱\n\n- 邮箱验证码由网站配置的邮件服务发送。\n- 游戏内邮箱挑战与网站登录验证码用途不同，不能混用。\n- QQ 绑定通过游戏内流程或已接入的 QQ 机器人完成，网站不会要求粘贴长令牌。\n- 可在个人中心查看并撤销其他网站会话。',
  },
  {
    id: 'link-game',
    title: '绑定游戏角色',
    titleEn: 'Linking Minecraft Character',
    category: '账号与安全',
    content: '# 绑定游戏角色\n\n将网站账号与游戏角色绑定，是同步皮肤、查看在线资产和白名单通行的前提。\n\n## 如何绑定\n\n- 前往个人中心，打开游戏账号选项卡。\n- 输入正版 Minecraft ID。\n- 进入任意 StarMC 验证服，控制台会显示一串 TOTP 验证码。\n- 将 6 位验证码输入网页并确认绑定。\n\n一个网站账号最多可绑定三个已验证角色。网站只保存绑定关系与角色设置，不会替换或重写正版 UUID。',
  },
  {
    id: 'security-2fa',
    title: '双重认证 (2FA)',
    titleEn: 'Two-Factor Authentication',
    category: '账号与安全',
    content: '# 双重认证 (2FA)\n\n二次验证默认关闭，可在个人中心按需开启。扫描二维码并输入当前六位验证码成功前，密钥不会正式启用。\n\n## 启用与恢复\n\n- 使用可信验证器扫描二维码并输入动态验证码。\n- 恢复码只在生成时完整展示，请离线保存。\n- 轮换后旧恢复码立即失效。\n- 关闭 2FA 属于敏感操作，需要再次验证。',
  },
  {
    id: 'support',
    title: '问题反馈',
    titleEn: 'Feedback',
    category: '账号与安全',
    content: '# 问题反馈\n\n账号与游戏问题请在个人中心的我的工单中提交和跟踪。日常交流可加入 QQ 群 764970620。',
  },
]

export function seedWikiPages() {
  return DEFAULT_WIKI_PAGES.map((page) => ({ ...page }))
}
