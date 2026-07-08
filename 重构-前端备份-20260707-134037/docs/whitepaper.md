# StarMC Refactor Technical Whitepaper

## 1. Architecture
- **Framework**: Vue 3.4 + Vite 5
- **Language**: TypeScript 5.4 (Strict)
- **State Management**: Pinia
- **Styling**: Tailwind CSS (Design Tokens) + SCSS
- **Animations**: GSAP + OGL (WebGL)

## 2. Directory Structure
- `src/components/atoms`: Basic building blocks (Button, Input)
- `src/components/molecules`: Combinations of atoms (ParticleBackground)
- `src/components/organisms`: Complex sections
- `src/views`: Page definitions
- `src/store`: Pinia stores

## 3. Deployment
Run `deploy.ps1` to build and deploy.

## 4. Performance
- Target: Lighthouse 95+
- Techniques: Code splitting, Asset optimization, WebGL for heavy visuals.
