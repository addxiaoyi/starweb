import { devWarn } from '@/shared/utils/devLog';

// 定义全局 Window 接口扩展
export interface WensetConfig {
    urls: {
        wiki: string;
        discord: string;
        bilibili: string;
        wikiApiBase: string;
        dashboard: string;
        liveStream: string;
        liveRoomId: string;
        promoVideo: string;
        bilibiliPlayer: string;
        bilibiliLive: string;
        corsProxies: string;
        hitokoto: string;
    };
    media: {
        videos: Array<{
            title: string;
            desc: string;
            bvid?: string;
            cover: string;
        }>;
    };
    images: {
        guideHero: string;
    };
    services: {
        avatar: string;
    };
    contacts: {
        qq: string;
        qqEmail: string;
        qqGroup: string;
        qqGroupLink: string;
    };
    social: {
        github: string;
        bilibili: string;
        mcmod: string;
        minebbs: string;
    };
    server: {
        javaIp: string;
        modIp: string;
        gunIp: string;
        bedrockIp: string;
        bedrockPort: number;
        version: string;
    };
    maps: {
        survival: string;
        nationWar: string;
        modSurvival: string;
    };
    links: {
        minecraft: string;
        education: string;
        feedback: string;
        forum: string;
        mcflare: string;
        minebbs: string;
    };
}

declare global {
    interface Window {
        WENSET: WensetConfig;
    }
}

// 默认配置 (作为兜底，开发环境如果没有载入 public/wenset.js 时使用)
export const defaultConfig: WensetConfig = {
    urls: {
        wiki: "https://addxiaoyi.codeberg.page/starmc-wiki-page/",
        discord: "https://discord.gg/JNXsCFVCYG",
        bilibili: "https://space.bilibili.com/3546700693521235",
        dashboard: "/proxy/dashboard/",
        wikiApiBase: "https://zh.minecraft.wiki/",
        liveStream: "https://live.bilibili.com/blackboard/live_player.html?cid=1954356368&quality=0",
    liveRoomId: "1954356368",
    promoVideo: "BV1YR23BMEUe",
    bilibiliPlayer: "https://player.bilibili.com",
    bilibiliLive: "https://live.bilibili.com",
    corsProxies: "https://api.codetabs.com/v1/proxy?quest=,https://corsproxy.io/?,https://api.allorigins.win/get?url=",
    hitokoto: "https://v1.hitokoto.cn/?c=a&c=b&c=c&c=d&c=i&encode=json"
  },
  media: {
    videos: [
        {
            title: "StarMC 服务器宣传视频(一)",
            desc: "探索无限可能的方块世界，体验纯粹的生存乐趣。",
            bvid: "BV1YR23BMEUe",
            cover: "https://picsum.photos/seed/starmc-promo/640/360"
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
  images: {
    guideHero: "https://picsum.photos/seed/starmc-hero/800/600"
  },
  services: {
    avatar: "https://q.qlogo.cn/headimg_dl?dst_uin={qq}&spec=640&img_type=jpg"
  },
  contacts: {
    qq: "2293237813",
    qqEmail: "2293237813@qq.com",
        qqGroup: "764970620",
        qqGroupLink: "https://qm.qq.com/q/zeZJxXkAy6"
    },
    social: {
        github: "https://github.com/addxiaoyi",
        bilibili: "https://space.bilibili.com/3546915199256973",
        mcmod: "https://center.mcmod.cn/1150040/",
        minebbs: "https://www.minebbs.com/threads/rpg-pylon.41891/"
    },
    server: {
    javaIp: "mc.star-mc.top",
    modIp: "mc.star-mc.top",
        gunIp: "gun.star-mc.top",
        bedrockIp: "mc.star-mc.top",
        bedrockPort: 22876,
        version: "1.20.x - 1.21.x"
    },
    maps: {
        survival: "/proxy/map/survival/#world:0:0:0:1500:0:0:0:perspective",
        nationWar: "/proxy/map/nationWar/",
        modSurvival: "/proxy/map/modSurvival/"
    },
    links: {
        minecraft: "https://www.minecraft.net/zh-hans",
        education: "https://education.minecraft.net/",
        feedback: "https://feedback.minecraft.net/",
        forum: "https://www.minecraftforum.net/",
        mcflare: "https://forum.mcflare.com/",
        minebbs: "https://www.minebbs.com/"
    }
};

/**
 * 获取全局配置
 * 优先从 window.WENSET 获取，如果没有则使用默认配置
 */
export const getWensetConfig = (): WensetConfig => {
    if (typeof window !== 'undefined' && window.WENSET) {
        // Perform a shallow merge of top-level properties and specific nested objects
        // to ensure new config sections (like 'media') are available even if
        // the user has an older cached version of wenset.js
        return {
            ...defaultConfig,
            ...window.WENSET,
            urls: { ...defaultConfig.urls, ...(window.WENSET.urls || {}) },
            media: { ...defaultConfig.media, ...(window.WENSET.media || {}) },
            images: { ...defaultConfig.images, ...(window.WENSET.images || {}) },
            services: { ...defaultConfig.services, ...(window.WENSET.services || {}) },
            contacts: { ...defaultConfig.contacts, ...(window.WENSET.contacts || {}) },
            social: { ...defaultConfig.social, ...(window.WENSET.social || {}) },
            server: { ...defaultConfig.server, ...(window.WENSET.server || {}) },
            maps: { ...defaultConfig.maps, ...(window.WENSET.maps || {}) },
            links: { ...defaultConfig.links, ...(window.WENSET.links || {}) },
        };
    }
    devWarn('Wenset config not found on window, using defaults');
    return defaultConfig;
};
