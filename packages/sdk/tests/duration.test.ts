import { describe, it, expect } from 'vitest';
import { Duration } from '../src/duration';

describe('Duration', () => {
  describe('factory methods', () => {
    it('creates duration from milliseconds', () => {
      const d = Duration.milliseconds(100);
      expect(d.toMilliseconds()).toBe(100);
    });

    it('creates duration from seconds', () => {
      const d = Duration.seconds(5);
      expect(d.toMilliseconds()).toBe(5000);
    });

    it('creates duration from minutes', () => {
      const d = Duration.minutes(2);
      expect(d.toMilliseconds()).toBe(120000);
    });

    it('creates duration from hours', () => {
      const d = Duration.hours(1);
      expect(d.toMilliseconds()).toBe(3600000);
    });

    it('creates duration from days', () => {
      const d = Duration.days(1);
      expect(d.toMilliseconds()).toBe(86400000);
    });
  });

  describe('conversion methods', () => {
    it('converts to seconds', () => {
      const d = Duration.milliseconds(5500);
      expect(d.toSeconds()).toBe(5.5);
    });

    it('converts to minutes', () => {
      const d = Duration.seconds(150);
      expect(d.toMinutes()).toBe(2.5);
    });

    it('converts to hours', () => {
      const d = Duration.minutes(90);
      expect(d.toHours()).toBe(1.5);
    });

    it('converts to days', () => {
      const d = Duration.hours(36);
      expect(d.toDays()).toBe(1.5);
    });
  });

  describe('arithmetic operations', () => {
    it('adds durations', () => {
      const d1 = Duration.seconds(10);
      const d2 = Duration.seconds(5);
      expect(d1.add(d2).toSeconds()).toBe(15);
    });

    it('subtracts durations', () => {
      const d1 = Duration.seconds(10);
      const d2 = Duration.seconds(3);
      expect(d1.subtract(d2).toSeconds()).toBe(7);
    });

    it('multiplies duration by scalar', () => {
      const d = Duration.seconds(5);
      expect(d.multiply(3).toSeconds()).toBe(15);
    });

    it('divides duration by scalar', () => {
      const d = Duration.seconds(15);
      expect(d.divide(3).toSeconds()).toBe(5);
    });
  });

  describe('comparison methods', () => {
    it('compares equal durations', () => {
      const d1 = Duration.seconds(10);
      const d2 = Duration.milliseconds(10000);
      expect(d1.equals(d2)).toBe(true);
    });

    it('compares unequal durations', () => {
      const d1 = Duration.seconds(10);
      const d2 = Duration.seconds(11);
      expect(d1.equals(d2)).toBe(false);
    });

    it('checks if duration is greater', () => {
      const d1 = Duration.seconds(10);
      const d2 = Duration.seconds(5);
      expect(d1.isGreaterThan(d2)).toBe(true);
      expect(d2.isGreaterThan(d1)).toBe(false);
    });

    it('checks if duration is less', () => {
      const d1 = Duration.seconds(5);
      const d2 = Duration.seconds(10);
      expect(d1.isLessThan(d2)).toBe(true);
      expect(d2.isLessThan(d1)).toBe(false);
    });
  });

  describe('utility methods', () => {
    it('converts to string in human-readable format', () => {
      expect(Duration.milliseconds(500).toString()).toBe('500ms');
      expect(Duration.seconds(30).toString()).toBe('30s');
      expect(Duration.minutes(5).toString()).toBe('5m');
      expect(Duration.hours(2).toString()).toBe('2h');
      expect(Duration.days(1).toString()).toBe('1d');
    });

    it('handles zero duration', () => {
      const d = Duration.milliseconds(0);
      expect(d.toMilliseconds()).toBe(0);
      expect(d.toSeconds()).toBe(0);
    });

    it('handles fractional durations', () => {
      const d = Duration.seconds(1.5);
      expect(d.toMilliseconds()).toBe(1500);
    });
  });
});
