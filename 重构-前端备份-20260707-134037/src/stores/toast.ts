import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastMessage[]>([]);

  const removeToast = (id: string) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };

  const addToast = (message: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const toast: ToastMessage = {
      id,
      ...message,
      duration: message.duration ?? 5000,
    };

    toasts.value.push(toast);

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration);
    }
  };

  return {
    toasts,
    addToast,
    removeToast,
  };
});
