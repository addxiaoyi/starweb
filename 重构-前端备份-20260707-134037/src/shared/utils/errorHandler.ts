import type { App, ComponentPublicInstance } from 'vue';
import { devWarn } from '@/shared/utils/devLog';
import { useToastStore } from '@/stores/toast';
import { getActivePinia } from 'pinia';
import { securityService } from '@/services/SecurityService';

function isMemoryAddressLog(message: unknown): boolean {
  return typeof message === 'string' && /^\[(0x|0X)[0-9a-fA-F]+( (0x|0X)[0-9a-fA-F]+)*\]$/.test(message);
}

export function logError(error: unknown, vm: ComponentPublicInstance | null = null, info: string = 'Unknown Error'): void {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error || 'Unknown Error');
    
    // Ignore memory address logs (internal engine logs)
    if (isMemoryAddressLog(errorMessage)) {
      return;
    }

    // Ignore ResizeObserver loops
    if (errorMessage.includes('ResizeObserver loop completed with undelivered notifications') || 
        errorMessage.includes('ResizeObserver loop limit exceeded')) {
      return;
    }

    let componentName = 'Unknown Component';
    try {
      if (vm && typeof vm === 'object') {
        const instance = vm as unknown as { $options?: { name?: string; __name?: string }; type?: { name?: string; __name?: string } };
        const options = instance.$options || instance.type;
        if (options) {
          componentName = options.name || options.__name || 'Anonymous Component';
        }
      }
    } catch (_e) {
      componentName = 'Error resolving component name';
    }
      
    console.error(`[Vue Error] ${info} in ${componentName}:`, error);
    
    // 上报到安全审计日志 (Fatal Errors)
    if (info !== 'unhandledrejection' && info !== 'window.error') {
       // 仅上报 Vue 内部未捕获的组件异常
       securityService.reportEvent('DOWNLOAD_ATTEMPT', `Fatal component error in ${componentName}: ${errorMessage}`);
    }

    // Notify user via Toast if Pinia is active
    if (getActivePinia()) {
      try {
        const toastStore = useToastStore();
        toastStore.addToast({
          type: 'error',
          title: 'Application Error',
          message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
          duration: 5000
        });
      } catch (storeError) {
        devWarn('Failed to dispatch error toast:', storeError);
      }
    }

    if (vm) {
      try {
        devWarn('Error found in component context:', vm);
      } catch (_vmError) {
        devWarn('Error found in component context (cannot log vm):', _vmError);
      }
    }
  } catch (e) {
    console.error('Fatal error in errorHandler:', e);
  }
}

const errorHandlerPlugin = {
  install(app: App): void {
    app.config.errorHandler = (err, instance, info) => {
      logError(err, instance as ComponentPublicInstance | null, info);
    };

    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      const errorMessage = error instanceof Error ? error.message : String(error || '');
      if (error && !isMemoryAddressLog(errorMessage)) {
        logError(error, null, 'unhandledrejection');
      }
    });

    window.addEventListener('error', (event) => {
      const error = event.error || event.message;
      const errorMessage = error instanceof Error ? error.message : String(error || '');
      if (error && !isMemoryAddressLog(errorMessage)) {
        logError(error, null, 'window.error');
      }
    });
  }
};

export default errorHandlerPlugin;
