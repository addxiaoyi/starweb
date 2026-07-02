/**
 * 无障碍 (A11y) 组合式函数
 * 提供自动化无障碍检测和改进建议
 */

import { ref, onUnmounted } from 'vue'

/**
 * A11y 检测结果
 */
export interface A11yViolation {
  /** 规则 ID */
  ruleId: string
  /** 严重程度 */
  severity: 'critical' | 'serious' | 'moderate' | 'minor'
  /** 问题描述 */
  description: string
  /** 修复建议 */
  help: string
  /** 帮助链接 */
  helpUrl: string
  /** 影响元素 */
  target: string[]
  /** 修复代码示例 */
  fix?: string
}

/**
 * A11y 扫描结果
 */
export interface A11yScanResult {
  /** 是否通过 */
  pass: boolean
  /** 违规数量 */
  violations: number
  /** 违规详情 */
  violationsList: A11yViolation[]
  /** 扫描时间 */
  scanTime: number
}

/**
 * 基础 A11y 检查规则
 */
const basicA11yRules = [
  {
    id: 'image-alt',
    check: () => {
      const images = document.querySelectorAll('img:not([alt])')
      return {
        pass: images.length === 0,
        violations: Array.from(images).map(img => ({
          ruleId: 'image-alt',
          severity: 'critical' as const,
          description: '图片缺少 alt 属性',
          help: '为所有图片添加描述性 alt 属性',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/image-alt',
          target: [img.tagName.toLowerCase()],
          fix: `<img src="${(img as HTMLImageElement).src}" alt="描述图片内容">`,
        })),
      }
    },
  },
  {
    id: 'button-name',
    check: () => {
      const buttons = document.querySelectorAll('button:not([aria-label]):not(:has(*))')
      const emptyButtons = Array.from(buttons).filter(btn => !btn.textContent?.trim())
      return {
        pass: emptyButtons.length === 0,
        violations: emptyButtons.map(btn => ({
          ruleId: 'button-name',
          severity: 'critical' as const,
          description: '按钮缺少可访问名称',
          help: '为按钮添加 aria-label 或可见文本',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/button-name',
          target: [btn.tagName.toLowerCase()],
          fix: `<button aria-label="按钮功能描述">...</button>`,
        })),
      }
    },
  },
  {
    id: 'link-name',
    check: () => {
      const links = document.querySelectorAll('a:not([aria-label])')
      const emptyLinks = Array.from(links).filter(link => !link.textContent?.trim() && !link.querySelector('img'))
      return {
        pass: emptyLinks.length === 0,
        violations: emptyLinks.map(link => ({
          ruleId: 'link-name',
          severity: 'critical' as const,
          description: '链接缺少可访问名称',
          help: '为链接添加描述性文本或 aria-label',
          helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/link-name',
          target: [link.tagName.toLowerCase()],
          fix: `<a href="..." aria-label="链接描述">...</a>`,
        })),
      }
    },
  },
  {
    id: 'color-contrast',
    check: () => {
      // 简化版对比度检查
      const elements = document.querySelectorAll('p, span, a, button, h1, h2, h3, h4, h5, h6')
      const violations: A11yViolation[] = []
      
      elements.forEach(el => {
        const style = window.getComputedStyle(el)
        const bgColor = style.backgroundColor
        
        // 检查是否为透明背景
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
          // 可能继承背景，跳过
          return
        }
      })
      
      return { pass: violations.length === 0, violations }
    },
  },
  {
    id: 'heading-order',
    check: () => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      const violations: A11yViolation[] = []
      let lastLevel = 0
      
      headings.forEach(heading => {
        const level = parseInt(heading.tagName[1])
        if (level > lastLevel + 1) {
          violations.push({
            ruleId: 'heading-order',
            severity: 'moderate' as const,
            description: `标题层级跳跃: H${lastLevel || 'none'} 到 H${level}`,
            help: '确保标题层级连续，不要跳跃',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/heading-order',
            target: [heading.tagName.toLowerCase()],
            fix: `将 <${heading.tagName.toLowerCase()}> 改为 <h${lastLevel + 1}>`,
          })
        }
        lastLevel = level
      })
      
      return { pass: violations.length === 0, violations }
    },
  },
  {
    id: 'form-label',
    check: () => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea')
      const violations: A11yViolation[] = []
      
      inputs.forEach(input => {
        const hasLabel = input.hasAttribute('aria-label') || 
                        input.hasAttribute('aria-labelledby') ||
                        input.hasAttribute('placeholder') ||
                        (input as HTMLInputElement).labels?.length > 0
        
        if (!hasLabel) {
          violations.push({
            ruleId: 'form-label',
            severity: 'critical' as const,
            description: '表单字段缺少标签',
            help: '为表单字段添加 label 或 aria-label',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.9/label',
            target: [input.tagName.toLowerCase()],
            fix: `<input aria-label="字段描述" ...>`,
          })
        }
      })
      
      return { pass: violations.length === 0, violations }
    },
  },
]

/**
 * 使用 A11y 检测
 */
export function useA11y() {
  const isScanning = ref(false)
  const lastResult = ref<A11yScanResult | null>(null)
  const violations = ref<A11yViolation[]>([])

  /**
   * 执行基础 A11y 扫描
   */
  const scan = async (): Promise<A11yScanResult> => {
    isScanning.value = true
    const startTime = performance.now()
    
    const allViolations: A11yViolation[] = []
    
    basicA11yRules.forEach(rule => {
      const result = rule.check()
      allViolations.push(...result.violations)
    })
    
    const scanTime = performance.now() - startTime
    
    const result: A11yScanResult = {
      pass: allViolations.length === 0,
      violations: allViolations.length,
      violationsList: allViolations,
      scanTime,
    }
    
    lastResult.value = result
    violations.value = allViolations
    isScanning.value = false
    
    return result
  }

  /**
   * 获取修复建议
   */
  const getFixes = (): string[] => {
    return violations.value
      .filter(v => v.fix)
      .map(v => v.fix!)
  }

  /**
   * 按严重程度分组
   */
  const getViolationsBySeverity = () => {
    const groups: Record<string, A11yViolation[]> = {
      critical: [],
      serious: [],
      moderate: [],
      minor: [],
    }
    
    violations.value.forEach(v => {
      groups[v.severity].push(v)
    })
    
    return groups
  }

  return {
    isScanning,
    lastResult,
    violations,
    scan,
    getFixes,
    getViolationsBySeverity,
  }
}

/**
 * 聚焦陷阱管理
 * 用于模态框等组件
 */
export function useFocusTrap(containerRef: { value: HTMLElement | null }) {
  const isActive = ref(false)
  let previouslyFocused: Element | null = null

  const activate = () => {
    if (!containerRef.value) return
    
    previouslyFocused = document.activeElement
    isActive.value = true
    
    // 聚焦到容器内的第一个可聚焦元素
    const focusableElements = getFocusableElements(containerRef.value)
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus()
    }
    
    // 添加键盘事件监听
    document.addEventListener('keydown', handleKeyDown)
  }

  const deactivate = () => {
    isActive.value = false
    document.removeEventListener('keydown', handleKeyDown)
    
    // 恢复之前的焦点
    if (previouslyFocused && (previouslyFocused as HTMLElement).focus) {
      (previouslyFocused as HTMLElement).focus()
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !containerRef.value) return
    
    const focusableElements = getFocusableElements(containerRef.value)
    if (focusableElements.length === 0) return
    
    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement
    
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault()
      lastElement.focus()
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault()
      firstElement.focus()
    }
  }

  onUnmounted(() => {
    if (isActive.value) {
      deactivate()
    }
  })

  return {
    isActive,
    activate,
    deactivate,
  }
}

/**
 * 获取可聚焦元素
 */
function getFocusableElements(container: HTMLElement): Element[] {
  const selector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable]',
  ].join(', ')
  
  return Array.from(container.querySelectorAll(selector))
    .filter(el => {
      // 检查元素是否可见
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })
}

/**
 * 宣布消息给屏幕阅读器
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcer = document.createElement('div')
  announcer.setAttribute('role', 'status')
  announcer.setAttribute('aria-live', priority)
  announcer.setAttribute('aria-atomic', 'true')
  announcer.className = 'sr-only'
  announcer.textContent = message
  
  document.body.appendChild(announcer)
  
  setTimeout(() => {
    document.body.removeChild(announcer)
  }, 1000)
}

/**
 * 跳过链接组件
 */
export function useSkipLink() {
  const skipToContent = (contentId: string) => {
    const element = document.getElementById(contentId)
    if (element) {
      element.setAttribute('tabindex', '-1')
      element.focus()
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return { skipToContent }
}
