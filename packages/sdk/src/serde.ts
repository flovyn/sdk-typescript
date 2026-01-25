/**
 * Serialization utilities for the Flovyn SDK.
 *
 * Provides a pluggable serialization layer for workflow and task
 * inputs/outputs.
 */

/**
 * Serializer interface for custom serialization implementations.
 */
export interface Serializer {
  /**
   * Serialize a value to a string.
   */
  serialize<T>(value: T): string;

  /**
   * Deserialize a string to a value.
   */
  deserialize<T>(data: string): T;
}

/**
 * Default JSON serializer.
 *
 * Handles standard JSON serialization with support for:
 * - Primitives (string, number, boolean, null)
 * - Objects and arrays
 * - Date objects (serialized as ISO strings)
 */
export class JsonSerializer implements Serializer {
  serialize<T>(value: T): string {
    // Pre-process to handle special types that JSON.stringify doesn't handle well
    const processed = this.preProcess(value);
    return JSON.stringify(processed);
  }

  /**
   * Pre-process a value to handle special types before JSON.stringify.
   */
  private preProcess(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle Date objects
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }

    // Handle BigInt
    if (typeof value === 'bigint') {
      return { __type: 'BigInt', value: value.toString() };
    }

    // Handle Buffer/Uint8Array
    if (value instanceof Uint8Array) {
      return { __type: 'Uint8Array', value: Array.from(value) };
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map((item) => this.preProcess(item));
    }

    // Handle plain objects
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.preProcess(val);
      }
      return result;
    }

    return value;
  }

  deserialize<T>(data: string): T {
    if (!data || data === '') {
      return null as T;
    }

    return JSON.parse(data, (_, v) => {
      // Revive Date objects
      if (v && typeof v === 'object' && v.__type === 'Date') {
        return new Date(v.value);
      }
      // Revive BigInt
      if (v && typeof v === 'object' && v.__type === 'BigInt') {
        return BigInt(v.value);
      }
      // Revive Uint8Array
      if (v && typeof v === 'object' && v.__type === 'Uint8Array') {
        return new Uint8Array(v.value);
      }
      return v;
    }) as T;
  }
}

/**
 * Default serializer instance.
 */
export const defaultSerializer: Serializer = new JsonSerializer();

/**
 * Serialize a value using the default serializer.
 */
export function serialize<T>(value: T): string {
  return defaultSerializer.serialize(value);
}

/**
 * Deserialize a string using the default serializer.
 */
export function deserialize<T>(data: string): T {
  return defaultSerializer.deserialize<T>(data);
}
