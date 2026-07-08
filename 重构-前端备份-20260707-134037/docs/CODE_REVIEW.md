# StarMC Code Review Standards

> Guidelines for conducting and participating in code reviews

## Pull Request Guidelines

### Before Creating a PR

- [ ] Code follows the project's style guidelines
- [ ] All tests pass locally (`npm run verify`)
- [ ] No lint warnings or only justified warnings
- [ ] Commit history is clean and follows Conventional Commits
- [ ] PR description clearly explains the changes and motivation

### PR Title Format

```
<type>(<scope>): <description>

Types:
  feat:     New feature
  fix:      Bug fix
  docs:     Documentation only changes
  style:    Changes that don't affect code meaning
  refactor: Code change that neither fixes a bug nor adds a feature
  perf:     Performance improvement
  test:     Adding or correcting tests
  chore:    Changes to build process or auxiliary tools
```

Examples:
```
feat(skin): add optimistic UI for skin application
fix(auth): handle token expiration gracefully
docs(readme): update installation instructions
```

---

## Review Checklist

### Code Quality

| Checkpoint | Description | Weight |
|------------|-------------|--------|
| TypeScript Types | No `any` types without justification | ⭐⭐⭐ |
| Component Size | Components under 200 lines | ⭐⭐ |
| Single Responsibility | Each function/component does one thing | ⭐⭐⭐ |
| Error Handling | All async operations have error handling | ⭐⭐⭐ |
| Naming | Variables and functions are self-documenting | ⭐⭐ |

### Performance

| Checkpoint | Description | Weight |
|------------|-------------|--------|
| Lazy Loading | Route components are lazy loaded | ⭐⭐⭐ |
| Image Optimization | Uses `OptimizedImage` or proper attributes | ⭐⭐ |
| Bundle Size | No significant bundle size increase | ⭐⭐⭐ |
| Reactivity | No unnecessary re-renders | ⭐⭐ |

### Security

| Checkpoint | Description | Weight |
|------------|-------------|--------|
| XSS Prevention | No `v-html` with user content | ⭐⭐⭐ |
| Input Validation | User inputs are validated | ⭐⭐⭐ |
| Authentication | Protected routes check auth state | ⭐⭐⭐ |
| Sensitive Data | No secrets in client code | ⭐⭐⭐ |

### Testing

| Checkpoint | Description | Weight |
|------------|-------------|--------|
| Unit Tests | New logic has unit tests | ⭐⭐⭐ |
| Test Quality | Tests are meaningful, not just for coverage | ⭐⭐ |
| Edge Cases | Critical paths have edge case coverage | ⭐⭐ |

---

## Review Process

### Author Responsibilities

1. **Self-review first**: Review your own code before requesting review
2. **Keep PRs small**: Prefer multiple small PRs over one large PR
3. **Provide context**: Add comments explaining non-obvious decisions
4. **Respond promptly**: Address feedback within 24 hours
5. **Don't take feedback personally**: Reviews are about code, not people

### Reviewer Responsibilities

1. **Be respectful**: Focus on the code, not the coder
2. **Be specific**: Point out exact issues, don't be vague
3. **Be helpful**: Suggest improvements, not just criticism
4. **Be timely**: Complete reviews within 24 hours
5. **Approve when ready**: Don't block for minor issues

---

## Common Issues and Fixes

### Issue: `any` Type

**Problem:**
```typescript
const handleData = (data: any) => { };
```

**Fix:**
```typescript
interface UserData {
  id: string;
  name: string;
  email: string;
}

const handleData = (data: UserData) => { };
```

### Issue: Missing Error Handling

**Problem:**
```typescript
async function fetchUser() {
  const response = await api.getUser();
  return response.data;
}
```

**Fix:**
```typescript
async function fetchUser() {
  try {
    const response = await api.getUser();
    return response.data;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user');
  }
}
```

### Issue: Prop Drilling

**Problem:**
```vue
<Parent :deep-prop="value" />
  <Child :deep-prop="deepProp" />
    <GrandChild :deep-prop="deepProp" />
```

**Fix:** Use Pinia store or composable
```typescript
// composables/useUser.ts
export function useUser() {
  return useState('user', () => fetchUser());
}
```

---

## Automated Checks

The following checks run automatically on every PR:

```bash
# Security baseline
npm run check:security-baseline

# Performance budget
npm run check:perf-budget

# Forbidden strings check
npm run check:forbidden-strings

# Lint
npm run lint

# Format check
npm run format:check

# Type check
vue-tsc --noEmit

# Unit tests
npm run test:unit
```

---

## Getting Your PR Reviewed

1. **Assign reviewers**: Assign at least 1 reviewer
2. **Link related issues**: Reference related issues/PRs
3. **Add labels**: Use labels like `feature`, `bug`, `refactor`
4. **Request review from experts**: For specific areas, request domain experts

## Merging

- PRs require **1 approval** for merging
- **Squash merge** is preferred for cleaner history
- Delete branch after merging
- Monitor CI/CD pipeline after deployment
