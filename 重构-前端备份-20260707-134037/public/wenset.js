// StarMC 网站配置文件
// 此文件可在打包后修改，刷新页面即可生效

window.WENSET = {
    // 网站链接
    urls: {
        // 官方 Wiki 地址
        wiki: "https://addxiaoyi.codeberg.page/starmc-wiki-page/",
        // Discord 邀请链接
        discord: "https://discord.gg/JNXsCFVCYG",
        // Bilibili 个人空间/官方号 (用于 GuideView)
        bilibili: "https://space.bilibili.com/3546700693521235",
        // 服务器状态监控仪表盘 (iframe 嵌入)
        dashboard: "/proxy/dashboard/",
        // Wiki API 基础地址 (用于获取热点教程)
        wikiApiBase: "https://zh.minecraft.wiki/",
        // Bilibili 直播间地址 (嵌入)
        liveStream: "https://live.bilibili.com/blackboard/live_player.html?cid=1954356368&quality=0",
        // Bilibili 直播间 ID (用于 API 查询)
        liveRoomId: "1954356368",
        // Bilibili 播放器基础 URL (用于构建嵌入式视频链接)
        bilibiliPlayer: "https://player.bilibili.com",
        // Bilibili 直播基础 URL
        bilibiliLive: "https://live.bilibili.com",
        // 宣传视频 BVID
        promoVideo: "BV1YR23BMEUe",
        // CORS 代理列表 (逗号分隔，用于直播状态查询)
        corsProxies: "https://api.allorigins.win/get?url=,https://api.codetabs.com/v1/proxy?quest=,https://corsproxy.io/?",
        // 一言 API 地址 (可以配置多个，用逗号分隔，或者只配一个)
        hitokoto: "https://v1.hitokoto.cn/?c=a&c=b&c=c&c=d&c=i&encode=json"
    },
    
    // 媒体内容配置
    media: {
        // 视频列表
        videos: [
            {
                title: "【舵星归途】开放世界开幕曲",
                desc: "恢弘大气的服务器主城，玩家集散的中心。",
                bvid: "BV1YR23BMEUe",
        cover: "/image/bilibili_cover.jpg"
      },
            {
                title: "StarMC 建筑展示 - 主城",
                desc: "恢弘大气的服务器主城，玩家集散的中心。",
                cover: "https://picsum.photos/seed/starmc-city/640/360"
            },
            {
                title: "StarMC 生存实录 - 第一天",
                desc: "记录在 StarMC 生存服的第一天冒险。",
                cover: "https://picsum.photos/seed/starmc-survival/640/360"
            },
            {
                title: "StarMC 红石机器展示",
                desc: "高效的红石农场与自动化设施。",
                cover: "https://picsum.photos/seed/starmc-redstone/640/360"
            },
            {
                title: "StarMC 玩家PVP锦标赛",
                desc: "激烈的PVP对决，谁才是最强王者？",
                cover: "https://picsum.photos/seed/starmc-pvp/640/360"
            },
            {
                title: "StarMC 跑酷活动精彩瞬间",
                desc: "挑战极限，飞檐走壁的跑酷大师们。",
                cover: "https://picsum.photos/seed/starmc-parkour/640/360"
            }
        ]
    },

    // 外部资源图片配置
    images: {
        // 指南页面 Hero 卡片背景图
        guideHero: "https://picsum.photos/seed/starmc-hero/800/600"
    },

    // 服务接口模板
    services: {
        // QQ 头像接口 ({qq} 会被替换为实际 QQ 号)
        avatar: "https://q.qlogo.cn/headimg_dl?dst_uin={qq}&spec=640&img_type=jpg"
    },

    // 联系方式
    contacts: {
        // QQ 号 (管理)
        qq: "2293237813",
        // QQ 邮箱 (用于 mailto)
        qqEmail: "2293237813@qq.com",
        // QQ 群号
        qqGroup: "764970620",
        // QQ 群加群链接
        qqGroupLink: "https://qm.qq.com/q/zeZJxXkAy6"
    },
    
    // 社交媒体链接 (主要用于页脚)
    social: {
        // GitHub 地址
        github: "https://github.com/addxiaoyi",
        // Bilibili 地址 (页脚使用)
        bilibili: "https://space.bilibili.com/3546915199256973",
        // MC百科 (MCMod) 地址
        mcmod: "https://center.mcmod.cn/1150040/",
        // MineBBS 地址
        minebbs: "https://www.minebbs.com/threads/rpg-pylon.41891/"
    },

    // 服务器信息
    server: {
        // Java 版服务器 IP
        javaIp: "mc.star-mc.top",
        // 模组服 IP / 备用 IP
        modIp: "mc.star-mc.top",
        // 枪战服 IP
        gunIp: "gun.star-mc.top",
        // 基岩版服务器 IP
        bedrockIp: "mc.star-mc.top",
        // 基岩版服务器端口
        bedrockPort: 22876,
        // 显示的版本信息
        version: "1.20.x - 1.21.x"
    },

    // 卫星地图链接配置
    maps: {
        // 养老服地图
        survival: "/proxy/map/survival/#world:0:0:0:1500:0:0:0:perspective",
        // 国战服地图
        nationWar: "/proxy/map/nationWar/",
        // 生存服地图
        modSurvival: "/proxy/map/modSurvival/"
    },

    // 外部链接 (用于页脚等位置)
    links: {
        // Minecraft 官方网站
        minecraft: "https://www.minecraft.net/zh-hans",
        // Minecraft 教育版
        education: "https://education.minecraft.net/",
        // Minecraft 反馈社区
        feedback: "https://feedback.minecraft.net/",
        // Minecraft Forum (国外非官方论坛)
        forum: "https://www.minecraftforum.net/",
        // MCFlare 论坛
        mcflare: "https://forum.mcflare.com/",
        // MineBBS 论坛首页
        minebbs: "https://www.minebbs.com/"
    }
};
