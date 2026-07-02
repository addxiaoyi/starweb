/**
 * BlockParticle.ts
 * 模拟 Minecraft 挖掘/点击方块时的粒子碎片反馈
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  decay: number;
}

class BlockParticleEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly particles: Particle[] = [];
  private animationId: number | null = null;

  constructor() {
    if (globalThis.window === undefined) return;
    
    this.initCanvas();
    globalThis.window.addEventListener('resize', () => this.resize());
  }

  private initCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'block-particle-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10000';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  }

  private resize() {
    if (!this.canvas) return;
    const dpr = globalThis.window.devicePixelRatio || 1;
    this.canvas.width = globalThis.window.innerWidth * dpr;
    this.canvas.height = globalThis.window.innerHeight * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  /**
   * 在指定位置创建粒子
   * @param x 屏幕 X 坐标
   * @param y 屏幕 Y 坐标
   * @param color 粒子颜色 (默认木板色)
   */
  public emit(x: number, y: number, color: string = '#795548') {
    if (!this.ctx) return;

    const count = 8 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 3,
        size: 3 + Math.random() * 4,
        color,
        life: 1,
        decay: 0.02 + Math.random() * 0.04
      });
    }

    if (!this.animationId) {
      this.animate();
    }
  }

  private animate() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width / (globalThis.window.devicePixelRatio || 1), this.canvas.height / (globalThis.window.devicePixelRatio || 1));
    
    // 更新并绘制粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // 重力加速度
      p.life -= p.decay;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      // 绘制像素方块
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      
      // 添加一个极细的黑边以增强像素感
      this.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.animationId = null;
    }
  }
}

// 导出单例
export const blockParticle = new BlockParticleEngine();
