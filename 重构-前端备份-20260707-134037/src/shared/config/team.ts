import { getWensetConfig } from './wenset';

export interface TeamConfig {
  AVATAR_SERVICES: ((qq: string) => string)[];
  PLAYER_UUIDS: Record<string, string>;
  DEFAULT_AVATAR: string;
  LIVE_STREAM_URL: string;
  IFRAME_SANDBOX: string;
  IFRAME_REFERRER: string;
  LIVE_CHECK_INTERVAL: number;
  LIVE_RETRY_DELAY: number;
}

export const TEAM_CONFIG: TeamConfig = {
  AVATAR_SERVICES: [
    (qq: string) => `https://q.qlogo.cn/headimg_dl?dst_uin=${qq}&spec=640&img_type=jpg`,
  ],
  
  PLAYER_UUIDS: {
    'ADDxiaoyi312048': '2293237813',
    'Steve3184': '43188400',
    'xyz': '3885570951',
    'wdsjwyf1728': '3979158171',
    'GeekerKuan': '3319529726',
    'qilinkun': '1822347575'
  },
  
  DEFAULT_AVATAR: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAHElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAA/FiAAa26gZAAAAAElFTkSuQmCC',
  
  get LIVE_STREAM_URL() {
    return getWensetConfig().urls.liveStream;
  },
  
  IFRAME_SANDBOX: 'allow-scripts allow-same-origin allow-forms allow-presentation',
  IFRAME_REFERRER: 'no-referrer',
  
  LIVE_CHECK_INTERVAL: 5000,
  LIVE_RETRY_DELAY: 100
};
