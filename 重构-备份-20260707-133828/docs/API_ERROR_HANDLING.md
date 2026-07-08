# StarMC API Error Handling Standards

> Standardized error types and handling patterns for the StarMC API

## Error Response Format

All API errors follow a consistent structure:

```typescript
interface ApiError {
  /** Machine-readable error code */
  code: string;
  
  /** Human-readable error message */
  message: string;
  
  /** Additional error details (optional) */
  details?: Record<string, unknown>;
  
  /** Field-specific errors (for validation) */
  fieldErrors?: FieldError[];
}

interface FieldError {
  field: string;
  message: string;
  code: string;
}
```

## Error Code Ranges

| Range | Category | Description |
|-------|----------|-------------|
| 1000xx | Authentication | Login, registration, token errors |
| 2000xx | Skin Operations | Skin upload, preview, application |
| 3000xx | User Management | Profile, settings, permissions |
| 4000xx | Admin | Admin panel operations |
| 5000xx | Server | Server status, connectivity |
| 9000xx | System | Internal errors, maintenance |

## Detailed Error Codes

### Authentication (1000xx)

| Code | Message | Description |
|------|---------|-------------|
| 100001 | `INVALID_CREDENTIALS` | Email or password incorrect |
| 100002 | `TOKEN_EXPIRED` | Authentication token has expired |
| 100003 | `TOKEN_INVALID` | Authentication token is invalid |
| 100004 | `EMAIL_NOT_VERIFIED` | Email has not been verified |
| 100005 | `RATE_LIMITED` | Too many login attempts |
| 100006 | `ACCOUNT_LOCKED` | Account has been locked |

### Skin Operations (2000xx)

| Code | Message | Description |
|------|---------|-------------|
| 200001 | `SKIN_TOO_LARGE` | Skin file exceeds size limit |
| 200002 | `INVALID_SKIN_FORMAT` | Skin must be PNG format |
| 200003 | `SKIN_DIMENSIONS_INVALID` | Skin must be 64x64 pixels |
| 200004 | `SKIN_UPLOAD_FAILED` | Upload process failed |
| 200005 | `SKIN_NOT_FOUND` | Requested skin does not exist |
| 200006 | `SKIN_UNAUTHORIZED` | Not authorized to modify this skin |

### Validation Errors (0000xx)

| Code | Message | Description |
|------|---------|-------------|
| 000001 | `VALIDATION_ERROR` | General validation failure |
| 000002 | `FIELD_REQUIRED` | Required field is missing |
| 000003 | `FIELD_INVALID_FORMAT` | Field format is incorrect |
| 000004 | `FIELD_TOO_LONG` | Field exceeds maximum length |
| 000005 | `FIELD_TOO_SHORT` | Field does not meet minimum length |

## Usage Examples

### Frontend Error Handling

```typescript
import { handleApiError, type ApiError } from '@/services/errors';

async function uploadSkin(file: File) {
  try {
    const response = await skinApi.upload(file);
    return response.data;
  } catch (error) {
    const apiError = handleApiError(error);
    
    switch (apiError.code) {
      case 'SKIN_TOO_LARGE':
        showToast('Skin file must be under 5MB', 'error');
        break;
      case 'INVALID_SKIN_FORMAT':
        showToast('Please upload a PNG file', 'error');
        break;
      case 'RATE_LIMITED':
        showToast('Please wait before uploading again', 'warning');
        break;
      default:
        showToast(apiError.message, 'error');
    }
    
    throw error;
  }
}
```

### Error Service Implementation

```typescript
// src/services/errors.ts

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  fieldErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export function handleApiError(error: unknown): ApiError {
  // Handle network errors
  if (!navigator.onLine) {
    return {
      code: 'NETWORK_ERROR',
      message: 'No internet connection. Please check your network.',
    };
  }

  // Handle fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      code: 'SERVER_UNREACHABLE',
      message: 'Server is temporarily unavailable. Please try again later.',
    };
  }

  // Handle API response errors
  if (isApiError(error)) {
    return error;
  }

  // Handle unknown errors
  console.error('Unknown error:', error);
  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unexpected error occurred. Please try again.',
  };
}

function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}
```

### Validation Error Display

```vue
<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  errors?: Array<{ field: string; message: string; code: string }>;
}

const props = defineProps<Props>();

const fieldErrors = computed(() => {
  const map: Record<string, string> = {};
  props.errors?.forEach((err) => {
    map[err.field] = err.message;
  });
  return map;
});

const hasError = (field: string) => !!fieldErrors.value[field];
const getError = (field: string) => fieldErrors.value[field];
</script>

<template>
  <div class="form-field">
    <label for="username">Username</label>
    <input
      id="username"
      v-model="username"
      :class="{ 'error': hasError('username') }"
      aria-describedby="username-error"
    />
    <span v-if="hasError('username')" id="username-error" class="error-message">
      {{ getError('username') }}
    </span>
  </div>
</template>
```

## Best Practices

### Do's

✅ **Always** handle API errors explicitly  
✅ **Use** consistent error codes from this document  
✅ **Provide** user-friendly error messages  
✅ **Log** errors for debugging (without sensitive data)  
✅ **Implement** retry logic for transient failures  

### Don'ts

❌ **Don't** show raw API error messages to users  
❌ **Don't** expose sensitive information in errors  
❌ **Don't** swallow errors silently  
❌ **Don't** assume errors are always network-related  

## Testing Error Handling

```typescript
import { describe, it, expect } from 'vitest';
import { handleApiError } from '@/services/errors';

describe('handleApiError', () => {
  it('should handle API error response', () => {
    const error = {
      code: 'SKIN_TOO_LARGE',
      message: 'Skin file exceeds maximum size',
    };

    const result = handleApiError(error);

    expect(result.code).toBe('SKIN_TOO_LARGE');
    expect(result.message).toBe('Skin file exceeds maximum size');
  });

  it('should handle network errors', () => {
    const error = new TypeError('Failed to fetch');

    const result = handleApiError(error);

    expect(result.code).toBe('SERVER_UNREACHABLE');
  });
});
```
