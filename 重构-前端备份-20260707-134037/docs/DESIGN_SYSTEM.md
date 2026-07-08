# StarMC Design System

> Design tokens and component guidelines for StarMC Website

## Design Tokens

### Color Palette

```css
:root {
  /* Primary Colors */
  --primary: #00ff88;           /* StarMC Green - Main brand color */
  --secondary: #1a1a2e;        /* Deep navy - Secondary backgrounds */
  --accent: #e94560;           /* Coral red - Accents and CTAs */

  /* Background Colors */
  --bg-primary: #0f0f23;       /* Main background - dark theme */
  --bg-secondary: #1a1a2e;     /* Cards and elevated surfaces */
  --bg-tertiary: #25253d;      /* Input fields and subtle highlights */

  /* Text Colors */
  --text-primary: #ffffff;     /* Primary text */
  --text-secondary: #b0b0c3;   /* Secondary/muted text */
  --text-muted: #6c6c7a;       /* Disabled/placeholder text */

  /* Status Colors */
  --success: #00ff88;          /* Success states - matches primary */
  --warning: #ffd93d;          /* Warning states */
  --error: #ff4757;            /* Error states */
  --info: #3498db;             /* Information states */
}
```

### Typography

```css
:root {
  /* Font Families */
  --font-sans: 'Minecraft', 'Zpix', 'SimSun', sans-serif;
  --font-minecraft: 'Minecraft', monospace;

  /* Font Sizes */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */
  --text-3xl: 1.875rem;  /* 30px */
  --text-4xl: 2.25rem;   /* 36px */

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
}
```

### Spacing Scale

```css
:root {
  --spacing-xs: 0.25rem;   /* 4px */
  --spacing-sm: 0.5rem;    /* 8px */
  --spacing-md: 1rem;       /* 16px */
  --spacing-lg: 1.5rem;     /* 24px */
  --spacing-xl: 2rem;       /* 32px */
  --spacing-2xl: 3rem;       /* 48px */
  --spacing-3xl: 4rem;       /* 64px */
}
```

### Border Radius

```css
:root {
  --radius-sm: 0.25rem;     /* 4px */
  --radius-md: 0.5rem;      /* 8px */
  --radius-lg: 0.75rem;     /* 12px */
  --radius-xl: 1rem;        /* 16px */
  --radius-full: 9999px;    /* Pill/round */
}
```

### Transitions

```css
:root {
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## Component Architecture

### Atomic Design Structure

```
src/components/
├── atoms/           # Basic building blocks
│   ├── Button.vue
│   ├── Input.vue
│   ├── Badge.vue
│   └── Icon.vue
│
├── molecules/      # Composed components
│   ├── SearchBar.vue
│   ├── Toast.vue
│   ├── Modal.vue
│   └── Card.vue
│
├── organisms/      # Complex components
│   ├── NavBar.vue
│   ├── HeroSection.vue
│   ├── SkinPreview.vue
│   └── BookUI.vue
│
└── templates/      # Page layouts
    └── PageTemplate.vue
```

### Component Naming Convention

```typescript
// Vue Single File Components: PascalCase
// Example: UserProfileCard.vue

// Props: camelCase with descriptive names
interface Props {
  userName: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

// Events: kebab-case
// Example: @update:modelValue, @submit-form

// Slots: kebab-case
// Example: <template #header>, <template #footer>
```

---

## Accessibility Guidelines

### Keyboard Navigation

- All interactive elements must be focusable
- Focus order should follow visual layout
- Visible focus indicators required (`:focus-visible`)
- Skip links for main content

### ARIA Patterns

```vue
<!-- Buttons -->
<button aria-label="Close dialog">×</button>

<!-- Dialogs/Modals -->
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Title</h2>
</div>

<!-- Form Fields -->
<label for="email">Email</label>
<input id="email" type="email" aria-describedby="email-hint" />
<span id="email-hint">We'll never share your email</span>

<!-- Live Regions -->
<div role="status" aria-live="polite">Loading complete</div>
<div role="alert" aria-live="assertive">Error message</div>
```

### Color Contrast

- Text on background: minimum 4.5:1 (AA)
- Large text (18px+): minimum 3:1
- UI components: minimum 3:1

---

## Best Practices

### Vue Composition API

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

interface Props {
  title: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update', value: string): void;
}>();

const store = useAuthStore();
const isLoading = ref(false);

const formattedTitle = computed(() => props.title.toUpperCase());

onMounted(() => {
  // Initialize component
});
</script>
```

### TypeScript Best Practices

- Avoid `any` type - use proper interfaces
- Use `type` for unions and intersections
- Use `interface` for object shapes
- Export types when needed by other components

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
}

// Better for unions
type Status = 'pending' | 'active' | 'banned';

// Avoid
const handleData = (data: any) => { };
```

---

## Dark Mode Support

All components must support dark mode by using CSS custom properties:

```vue
<template>
  <div class="card" :class="{ 'dark': isDark }">
    <h2 class="text-primary">Title</h2>
    <p class="text-secondary">Description</p>
  </div>
</template>

<style scoped>
.card {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.text-primary {
  color: var(--text-primary);
}

.text-secondary {
  color: var(--text-secondary);
}
</style>
```

---

## Performance Guidelines

1. **Lazy Loading**: Use `<Suspense>` and `defineAsyncComponent`
2. **Code Splitting**: Split by route, not by feature
3. **Image Optimization**: Use `<OptimizedImage>` component
4. **Bundle Size**: Monitor with `npm run build` stats
5. **Vitest Coverage**: Maintain >70% coverage

---

## References

- [Vue 3 Documentation](https://vuejs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
