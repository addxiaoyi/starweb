# Comprehensive Refactor & QA Master Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the current codebase into a production-grade, high-performance, and bug-free application through systematic debugging, refactoring, and rigorous testing.

**Architecture:**
- **Framework:** Vue 3 + TypeScript + Vite
- **Styling:** Tailwind CSS + Design Tokens (Atomic Design)
- **State Management:** Pinia
- **Testing:** Vitest (Unit) + Playwright (E2E)
- **Quality Gates:** Strict ESLint + Prettier + SonarQube-aligned metrics

---

### Phase 1: System Health & Bug Fixes (High Priority)

**Task 1.1: Deep Bug Scan & Fix**
- **Scan**: Search for memory leaks (uncleaned listeners, intervals, timeouts), `any` types, and improper component lifecycles.
- **Fix**: Implement strict resource disposal in `onUnmounted`.
- **Target Files**: `MapView.tsx`, `VideoView.tsx`, `HeroSection.vue`, `Balatro.vue`.

**Task 1.2: Error Handling Standardization**
- **Refactor**: Upgrade `errorHandler.ts` to integrate with a UI notification system (Toast/Snackbar).
- **Implement**: Global Error Boundary component to catch unhandled errors in component trees.

**Task 1.3: Performance Optimization**
- **Audit**: Check bundle size and lazy loading implementation.
- **Optimize**: Ensure heavy assets (videos, 3D models) and components (`Map`, `Video`) are lazy-loaded and properly disposed.

---

### Phase 2: Architectural Refactoring ("The Ugly" -> "The Good")

**Task 2.1: Component Standardization (TSX to SFC)**
- **Refactor**: Convert `MapView.tsx`, `VideoView.tsx`, `ZtjkView.tsx` to Vue SFCs (`.vue`) for consistency with the rest of the project, unless TSX provides specific required capabilities.
- **Style**: Extract styles from `styles.module.scss` to Tailwind utility classes or scoped CSS.

**Task 2.2: Utility Refactoring**
- **Review**: `debounceThrottle.ts`, `minecraftServerUtils.ts`.
- **Refactor**: Ensure strictly typed interfaces, remove redundant code, and add unit tests.

**Task 2.3: Design System Enforcement**
- **Audit**: Check for hardcoded colors/spacings.
- **Refactor**: Replace magic values with Tailwind classes and CSS variables defined in `main.css`.

---

### Phase 3: Testing & Stability ("The Good" -> "The Robust")

**Task 3.1: Unit Testing Suite**
- **Setup**: Configure Vitest if not fully active.
- **Implement**: Write unit tests for all utils (`errorHandler`, `security`, `storage`) and key atoms/molecules.
- **Goal**: >85% coverage for core logic.

**Task 3.2: Regression Testing**
- **Setup**: Ensure Playwright E2E tests cover critical paths (Navigation, Map loading, Video playback).
- **Verify**: Run tests to ensure refactoring didn't break existing features.

---

### Phase 4: Documentation & Delivery

**Task 4.1: Documentation**
- **Create**: `README.md` (updated), `CONTRIBUTING.md`, `ARCHITECTURE.md`.
- **Doc**: Auto-generate component documentation if possible.

**Task 4.2: Final Verification**
- **Run**: Full test suite (Unit + E2E).
- **Lint**: Full strict lint check.
- **Build**: Production build verification.

---

## Execution Strategy

**1. Subagent-Driven**: I will dispatch tasks sequentially.
**2. Verification**: Every step requires `verification-before-completion`.
**3. "Good" Code Preservation**: Code identified as "Good" (e.g., `Atomic Design` structure) will be preserved and bolstered with tests.
