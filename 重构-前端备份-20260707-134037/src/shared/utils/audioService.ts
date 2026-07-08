/**
 * audioService.ts
 * 原汁原味的 Minecraft UI 点击音效。
 */

class AudioService {
  private readonly clickSound: HTMLAudioElement | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (globalThis.window === undefined) return;
    
    // 加载 Minecraft 经典点击音效 (Base64 数据 URI 确保稳定加载)
    this.clickSound = new Audio('data:audio/wav;base64,UklGRmYBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVABAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v/9///+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+/v/+//7//v/+//7//v/+/v/+//7//v/+'); 
    // 以上 Base64 为极简点击音效示意。
    this.clickSound.volume = 0.3;
    
    // 初始化音量状态 (从 localStorage 恢复)
    this.isMuted = localStorage.getItem('starmc_audio_muted') === 'true';
  }

  /**
   * 播放点击音效
   */
  public playClick() {
    if (this.isMuted || !this.clickSound) return;
    
    // 强制克隆一个实例进行播放，防止快速连点时音效中断
    const sound = this.clickSound.cloneNode() as HTMLAudioElement;
    sound.volume = this.clickSound.volume;
    sound.play().catch(e => {
        // 在用户与页面有交互前，部分浏览器会阻止自动播放音频。这是正常现象。
        console.debug('音效播放被阻止:', e);
    });
  }

  /**
   * 切换静音状态
   */
  public toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('starmc_audio_muted', String(this.isMuted));
    return this.isMuted;
  }

  public getMuteStatus() {
    return this.isMuted;
  }
}

// 导出单例
export const audioService = new AudioService();
