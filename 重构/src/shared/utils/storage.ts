const STORAGE_PREFIX = 'starmc_';
const DEFAULT_TTL = 5 * 60 * 1000;

export type SchemaType = 'string' | 'number' | 'boolean' | 'array' | 'object';
export type Schema = Record<string, [SchemaType, boolean]>;

interface StorageData<T> {
  value: T;
  timestamp: number;
  expires: number;
}

export class StorageManager {
  private prefix: string;

  constructor(prefix: string = STORAGE_PREFIX) {
    this.prefix = prefix;
  }

  private _getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private _validateData(data: unknown, schema: Schema): boolean {
    if (!data || typeof data !== 'object') {
      throw new Error('Data is null or not an object');
    }

    const errors: string[] = [];
    const typedData = data as Record<string, unknown>;
    
    for (const [field, [type, required]] of Object.entries(schema)) {
      if (required && !(field in typedData)) {
        errors.push(`Missing required field: ${field}`);
      }
      
      if (field in typedData) {
        const value = typedData[field];
        
        if (type === 'string' && typeof value !== 'string') {
          errors.push(`Field ${field} must be a string`);
        } else if (type === 'number' && typeof value !== 'number') {
          errors.push(`Field ${field} must be a number`);
        } else if (type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Field ${field} must be a boolean`);
        } else if (type === 'array' && !Array.isArray(value)) {
          errors.push(`Field ${field} must be an array`);
        } else if (type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
          errors.push(`Field ${field} must be an object`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Data validation failed: ${errors.join(', ')}`);
    }
    
    return true;
  }

  setItem<T>(key: string, value: T, ttl: number = DEFAULT_TTL): boolean {
    try {
      const fullKey = this._getKey(key);
      const data: StorageData<T> = {
        value,
        timestamp: Date.now(),
        expires: Date.now() + ttl
      };
      
      localStorage.setItem(fullKey, JSON.stringify(data));
      return true;
    } catch (_error) {
      return false;
    }
  }

  getItem<T>(key: string, schema: Schema | null = null): T | null {
    try {
      const fullKey = this._getKey(key);
      const item = localStorage.getItem(fullKey);
      
      if (!item) {
        return null;
      }
      
      const data: StorageData<T> = JSON.parse(item);
      
      if (data.expires && Date.now() > data.expires) {
        this.removeItem(key);
        return null;
      }
      
      if (schema) {
        this._validateData(data.value, schema);
      }
      
      return data.value;
    } catch (_error) {
      this.removeItem(key);
      return null;
    }
  }

  removeItem(key: string): boolean {
    try {
      const fullKey = this._getKey(key);
      localStorage.removeItem(fullKey);
      return true;
    } catch (_error) {
      return false;
    }
  }

  clear(): void {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    keys.forEach(key => localStorage.removeItem(key));
  }
}

export const storage = new StorageManager();
