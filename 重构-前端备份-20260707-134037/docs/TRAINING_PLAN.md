# StarMC Team Training Plan

> Structured learning path for team members to master the StarMC tech stack

## Weekly Learning Schedule

### Week 1: Vue 3 & Composition API Mastery

**Topics:**
- Reactive state with `ref` and `reactive`
- Computed properties and watchers
- Lifecycle hooks in Composition API
- Custom composables patterns

**Resources:**
- [Vue 3 Documentation](https://vuejs.org/guide/introduction.html)
- [Vue School - Vue 3 Composition API](https://vueschool.io/)

**Practice:**
- Convert one existing Options API component to Composition API
- Create a custom composable that is reusable

---

### Week 2: TypeScript Deep Dive

**Topics:**
- Type inference and explicit types
- Generics and utility types
- Interface vs Type aliases
- Mapped types and conditional types

**Resources:**
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Type Challenges](https://github.com/type-challenges/type-challenges)

**Practice:**
- Add proper types to one untyped function
- Create a generic utility function

---

### Week 3: State Management with Pinia

**Topics:**
- Store design patterns
- Composables vs Stores
- State persistence
- Testing Pinia stores

**Resources:**
- [Pinia Documentation](https://pinia.vuejs.org/)

**Practice:**
- Migrate one prop-drilled state to Pinia store
- Write unit tests for a store

---

### Week 4: Testing Best Practices

**Topics:**
- Unit testing with Vitest
- Component testing with Vue Test Utils
- E2E testing with Playwright
- Test-driven development (TDD)
- Storybook component documentation

**Commands:**
```bash
# Run unit tests
npm run test:unit

# Run E2E tests
npm run test:e2e

# Start Storybook
npm run storybook

# Build Storybook static site
npm run build:storybook
```

**Resources:**
- [Vitest Guide](https://vitest.dev/guide/)
- [Vue Testing Handbook](https://lmiller1990.github.io/vue-testing-handbook/)
- [Storybook Vue3 Guide](https://storybook.js.org/docs/vue3/writing-stories/introduction/)

**Pre-configured Stories:**
- `AppIcon` - Icon component showcase
- `ShinyText` - Animated text effect
- `McButton` - Button variants

**Practice:**
- Write tests for a utility function
- Add E2E test for a user flow
- Create a Storybook story for a new component

---

### Week 5: Performance Optimization

**Topics:**
- Vue reactivity performance
- Lazy loading and code splitting
- Image optimization
- Bundle size analysis

**Resources:**
- [Vue Performance Guide](https://vuejs.org/guide/best-practices/performance.html)
- [Web Vitals](https://web.dev/vitals/)

**Practice:**
- Analyze bundle with `stats.html`
- Implement lazy loading for a route

---

### Week 6: Security & Accessibility

**Topics:**
- XSS prevention
- Authentication best practices
- WCAG 2.1 guidelines
- Keyboard navigation

**Resources:**
- [OWASP Top 10](https://owasp.org/Top10/)
- [A11y Project](https://www.a11yproject.com/)

**Practice:**
- Audit one page for accessibility
- Implement proper form validation

---

## Mentorship Program

### For New Team Members

**Week 1-2: Onboarding**
- Development environment setup
- Codebase walkthrough
- First small task (good first issue)

**Week 3-4: Pair Programming**
- Pair with senior developer
- Code review participation
- Handle a bug fix

**Week 5-8: Independence**
- Own a feature end-to-end
- Regular code reviews
- Weekly 1-on-1 check-ins

---

## Skill Assessment Rubric

| Level | Description | Indicators |
|-------|-------------|------------|
| **Novice** | Learning fundamentals | Follows examples, needs guidance |
| **Beginner** | Can apply with help | Completes tasks with supervision |
| **Intermediate** | Works independently | Solves known problems on own |
| **Advanced** | Solves complex problems | Tackles novel challenges |
| **Expert** | Teaches others | Guides team, makes architectural decisions |

---

## Knowledge Sharing

### Tech Talks (Bi-weekly)

| Session | Topic | Presenter |
|---------|-------|-----------|
| 1 | Vue 3 Reactivity Deep Dive | Team Lead |
| 2 | TypeScript Advanced Types | Senior Dev |
| 3 | Performance Optimization Case Study | Tech Lead |
| 4 | Testing Strategies | QA Lead |

### Documentation Responsibilities

Every team member should contribute to:
- Updating `docs/` when changing functionality
- Improving `CODE_REVIEW.md` with lessons learned
- Maintaining component examples

---

## Resources

### Required Reading

1. [Vue 3 Style Guide](https://vuejs.org/style-guide/)
2. [TypeScript Coding Guidelines](https://typescript-eslint.io/troubleshooting/ts-eslint/)
3. StarMC Design System
4. API Error Handling

### Tool Proficiency

| Tool | Proficiency Level |
|------|-------------------|
| Git | Required |
| VS Code + Extensions | Required |
| Vue DevTools | Required |
| Chrome DevTools | Required |
| Playwright | Intermediate |
| Vitest | Intermediate |
| Vite | Advanced |

---

## Career Growth Path

```
Junior Developer
    ↓
Mid-Level Developer (6-12 months)
    ↓
Senior Developer (12-24 months)
    ↓
Tech Lead / Architect
```

### Milestones for Promotion

**Mid-Level:**
- Complete 3+ features independently
- Pass code review with minimal feedback
- Mentor 1 junior developer

**Senior:**
- Lead feature development
- Make architectural decisions
- Conduct code reviews
- Identify and solve tech debt

**Tech Lead:**
- Design system architecture
- Drive technical strategy
- Grow team capabilities
- Represent team in planning
