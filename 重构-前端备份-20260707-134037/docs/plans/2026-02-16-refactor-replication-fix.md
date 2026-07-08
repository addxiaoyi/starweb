# Starmc Website Replication & Refactor Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Achieve a 1:1 visual and functional replication of the original Starmc website while refactoring the codebase to use Vue 3, TypeScript, and Tailwind CSS.

**Architecture:**
- **Framework:** Vue 3 + Vite
- **Styling:** Tailwind CSS + Custom CSS Variables (porting from SCSS)
- **State Management:** Pinia
- **Design System:** Atomic Design (Atoms, Molecules, Organisms)

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS, GSAP, OGL, FontAwesome

---

### Task 1: Assets Migration (Completed)
- Copied `public/*` from source to target.

### Task 2: Global Styles & Tailwind Configuration (Completed)
- Ported `main.scss` variables and utilities to `src/styles/main.css`.
- Configured `tailwind.config.js`.

### Task 3: Component Refinement (Completed)
- Refined `HeroSection`, `TeamCarousel`, `Sponsor` to match source styles.

---

### Task 4: Migrate Missing Views - Phase 1 (Map & Video)

**Files:**
- Create: `src/views/MapView.vue` (Port from `MapView/src/MapView.tsx`)
- Create: `src/views/VideoView.vue` (Port from `VideoView/src/VideoView.tsx`)

**Step 1: MapView**
Port the iframe logic for Dynmap/BlueMap.

**Step 2: VideoView**
Port the video player layout.

---

### Task 5: Migrate Missing Views - Phase 2 (Tutorials)

**Files:**
- Create: `src/views/tutorials/LauncherTutorialView.vue`
- Create: `src/views/tutorials/InstallTutorialView.vue`
- Create: `src/views/tutorials/ConnectTutorialView.vue`
- Create: `src/views/tutorials/BasicsTutorialView.vue`
- Create: `src/views/tutorials/ResidenceTutorialView.vue`

**Step 1: Launcher Tutorial**
Port `LauncherTutorialView.tsx` logic and styles.

**Step 2: Other Tutorials**
Port the Vue components from `tutorials/*.vue`.

---

### Task 6: Migrate Missing Views - Phase 3 (Auth & User)

**Files:**
- Create: `src/views/YggdrasilAuthView.vue`
- Create: `src/views/ProfileView.vue`
- Create: `src/views/ApiInfoView.vue`

**Step 1: Auth View**
Port Yggdrasil authentication logic.

**Step 2: Profile & API**
Port user profile and API info pages.

---

### Task 7: Router Update

**Files:**
- Modify: `src/router/index.ts`

**Step 1: Update Routes**
Replace `ComingSoon` components with the actual migrated views.
