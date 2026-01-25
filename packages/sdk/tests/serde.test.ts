import { describe, it, expect } from 'vitest';
import { serialize, deserialize, JsonSerializer } from '../src/serde';

describe('Serialization', () => {
  describe('serialize and deserialize', () => {
    it('handles primitives', () => {
      expect(deserialize(serialize('hello'))).toBe('hello');
      expect(deserialize(serialize(42))).toBe(42);
      expect(deserialize(serialize(3.14))).toBe(3.14);
      expect(deserialize(serialize(true))).toBe(true);
      expect(deserialize(serialize(false))).toBe(false);
      expect(deserialize(serialize(null))).toBe(null);
    });

    it('handles arrays', () => {
      const arr = [1, 2, 3, 'four', true];
      expect(deserialize(serialize(arr))).toEqual(arr);
    });

    it('handles objects', () => {
      const obj = { name: 'test', value: 42, nested: { a: 1 } };
      expect(deserialize(serialize(obj))).toEqual(obj);
    });

    it('handles Date objects', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = deserialize<Date>(serialize(date));
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe(date.toISOString());
    });

    it('handles BigInt values', () => {
      const bigInt = BigInt('9007199254740993');
      const result = deserialize<bigint>(serialize(bigInt));
      expect(result).toBe(bigInt);
    });

    it('handles Uint8Array', () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5]);
      const result = deserialize<Uint8Array>(serialize(arr));
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
    });

    it('handles nested special types', () => {
      const obj = {
        date: new Date('2024-01-15T10:30:00.000Z'),
        data: new Uint8Array([1, 2, 3]),
        count: BigInt('123456789'),
        items: [1, 2, 3],
      };
      const result = deserialize<typeof obj>(serialize(obj));
      expect(result.date).toBeInstanceOf(Date);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.count).toBe(BigInt('123456789'));
      expect(result.items).toEqual([1, 2, 3]);
    });

    it('handles empty string input', () => {
      expect(deserialize('')).toBe(null);
    });
  });

  describe('JsonSerializer', () => {
    it('creates a reusable serializer instance', () => {
      const serializer = new JsonSerializer();
      const data = { test: 'value' };
      expect(serializer.deserialize(serializer.serialize(data))).toEqual(data);
    });
  });
});
