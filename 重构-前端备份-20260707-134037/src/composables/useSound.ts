import { ref, onUnmounted } from 'vue';
import { devLog } from '@/shared/utils/devLog';

export function useSound() {
  const audioContext = ref<AudioContext | null>(null);

  const initAudioContext = () => {
    if (!audioContext.value) {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioContext.value = new AudioContextClass();
      }
    }
  };

  const playClickSound = (volume = 0.3) => {
    try {
      initAudioContext();
      if (!audioContext.value) return;

      const ctx = audioContext.value;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
      devLog('Audio playback error:', e);
    }
  };

  onUnmounted(() => {
    if (audioContext.value) {
      audioContext.value.close();
      audioContext.value = null;
    }
  });

  return {
    playClickSound
  };
}
