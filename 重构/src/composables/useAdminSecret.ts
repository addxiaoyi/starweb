import { computed, onMounted, ref, watch } from 'vue'

interface UseAdminSecretOptions {
  storageKey?: string
  persist?: boolean
  initialValue?: string
}

const DEFAULT_STORAGE_KEY = 'starmc_admin_secret'

export function useAdminSecret(options: UseAdminSecretOptions = {}) {
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY
  const persist = options.persist !== false
  const adminSecret = ref(String(options.initialValue || ''))
  const hasSecret = computed(() => adminSecret.value.trim().length > 0)

  const saveSecret = (secret: string) => {
    if (!persist || typeof window === 'undefined') return
    const normalized = String(secret || '')
    if (!normalized.trim()) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, normalized)
  }

  const hydrateSecret = () => {
    if (!persist || typeof window === 'undefined') return
    const cached = window.sessionStorage.getItem(storageKey) || ''
    if (cached.trim()) {
      adminSecret.value = cached
    }
  }

  const clearAdminSecret = () => {
    adminSecret.value = ''
    saveSecret('')
  }

  watch(adminSecret, (secret) => {
    saveSecret(secret)
  })

  onMounted(() => {
    hydrateSecret()
  })

  return {
    adminSecret,
    hasSecret,
    clearAdminSecret,
    hydrateSecret
  }
}
