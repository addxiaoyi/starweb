<template>
  <canvas ref="bgCanvas" class="background-canvas"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const bgCanvas = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number;
let resizeListener: (() => void) | null = null;
let mouseListener: ((e: MouseEvent) => void) | null = null;

const initBackground = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const updateDimensions = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    if (canvas) {
        canvas.width = width;
        canvas.height = height;
    }
  };
  
  let resizeTimeout: number;
  resizeListener = () => {
    window.clearTimeout(resizeTimeout);
    resizeTimeout = window.setTimeout(updateDimensions, 200);
  };
  
  window.addEventListener('resize', resizeListener, { passive: true });

  const particles: Particle[] = [];
  const particleCount = window.innerWidth < 768 ? 40 : 80; // Reduce count on mobile

  // Mouse interaction
  const mouse = { x: -1000, y: -1000 };

  mouseListener = (e: MouseEvent) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  };
  window.addEventListener('mousemove', mouseListener, { passive: true });

  class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    color: string;

    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.5; // Slow drift
      this.vy = (Math.random() - 0.5) * 0.5;
      this.size = Math.random() * 3 + 1; // Minecraft pixel size
      
      // Star/Space colors
      const colors = ['#6366f1', '#8b5cf6', '#3b82f6', '#ffffff'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      // Normal movement
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around screen
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;

      // Mouse Interaction - Repulsion
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const maxDistance = 150;

      if (distance < maxDistance) {
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        const force = (maxDistance - distance) / maxDistance;
        const directionX = forceDirectionX * force * 5; // Strength
        const directionY = forceDirectionY * force * 5;

        this.x -= directionX;
        this.y -= directionY;
      }
    }

    draw() {
      if (!ctx) return;
      ctx.fillStyle = this.color;
      // Draw square for Minecraft feel
      ctx.fillRect(this.x, this.y, this.size, this.size);
    }
  }

  // Initialize particles
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  const animate = () => {
    ctx.clearRect(0, 0, width, height);
    
    // Draw connecting lines (constellations)
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
      
      // Connect nearby particles
      for (let j = i; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distanceSq = dx * dx + dy * dy;
        
        if (distanceSq < 10000) { // 100 * 100
          const distance = Math.sqrt(distanceSq);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 - distance/1000})`;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    
    animationFrameId = requestAnimationFrame(animate);
  };

  animate();
};

onMounted(() => {
  initBackground();
});

onUnmounted(() => {
  if (resizeListener) {
    window.removeEventListener('resize', resizeListener as EventListener);
  }
  if (mouseListener) {
    window.removeEventListener('mousemove', mouseListener as EventListener);
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<style scoped>
.background-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  opacity: 0.6;
}
</style>
