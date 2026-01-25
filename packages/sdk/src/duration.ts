/**
 * Duration utilities for specifying time intervals.
 *
 * @example
 * ```typescript
 * import { Duration } from '@flovyn/sdk';
 *
 * await ctx.sleep(Duration.seconds(30));
 * await ctx.sleep(Duration.minutes(5));
 * await ctx.sleep(Duration.hours(1));
 * ```
 */

/**
 * Represents a time duration with millisecond precision.
 */
export class Duration {
  private constructor(private readonly ms: number) {}

  /**
   * Create a duration from milliseconds.
   */
  static milliseconds(value: number): Duration {
    return new Duration(value);
  }

  /**
   * Create a duration from seconds.
   */
  static seconds(value: number): Duration {
    return new Duration(value * 1000);
  }

  /**
   * Create a duration from minutes.
   */
  static minutes(value: number): Duration {
    return new Duration(value * 60 * 1000);
  }

  /**
   * Create a duration from hours.
   */
  static hours(value: number): Duration {
    return new Duration(value * 60 * 60 * 1000);
  }

  /**
   * Create a duration from days.
   */
  static days(value: number): Duration {
    return new Duration(value * 24 * 60 * 60 * 1000);
  }

  /**
   * Get the duration in milliseconds.
   */
  toMilliseconds(): number {
    return this.ms;
  }

  /**
   * Get the duration in seconds.
   */
  toSeconds(): number {
    return this.ms / 1000;
  }

  /**
   * Get the duration in minutes.
   */
  toMinutes(): number {
    return this.ms / (60 * 1000);
  }

  /**
   * Get the duration in hours.
   */
  toHours(): number {
    return this.ms / (60 * 60 * 1000);
  }

  /**
   * Get the duration in days.
   */
  toDays(): number {
    return this.ms / (24 * 60 * 60 * 1000);
  }

  /**
   * Add another duration to this one.
   */
  add(other: Duration): Duration {
    return new Duration(this.ms + other.ms);
  }

  /**
   * Subtract another duration from this one.
   */
  subtract(other: Duration): Duration {
    return new Duration(this.ms - other.ms);
  }

  /**
   * Multiply this duration by a factor.
   */
  multiply(factor: number): Duration {
    return new Duration(this.ms * factor);
  }

  /**
   * Divide this duration by a factor.
   */
  divide(factor: number): Duration {
    return new Duration(this.ms / factor);
  }

  /**
   * Check if this duration is greater than another.
   */
  isGreaterThan(other: Duration): boolean {
    return this.ms > other.ms;
  }

  /**
   * Check if this duration is less than another.
   */
  isLessThan(other: Duration): boolean {
    return this.ms < other.ms;
  }

  /**
   * Check if this duration is zero.
   */
  isZero(): boolean {
    return this.ms === 0;
  }

  /**
   * Check if this duration is positive (greater than zero).
   */
  isPositive(): boolean {
    return this.ms > 0;
  }

  /**
   * Check if this duration is negative (less than zero).
   */
  isNegative(): boolean {
    return this.ms < 0;
  }

  /**
   * Compare this duration to another.
   * Returns -1 if this < other, 0 if equal, 1 if this > other.
   */
  compareTo(other: Duration): number {
    if (this.ms < other.ms) return -1;
    if (this.ms > other.ms) return 1;
    return 0;
  }

  /**
   * Check if this duration equals another.
   */
  equals(other: Duration): boolean {
    return this.ms === other.ms;
  }

  /**
   * Get a human-readable string representation.
   */
  toString(): string {
    if (this.ms === 0) return '0ms';

    const abs = Math.abs(this.ms);
    const sign = this.ms < 0 ? '-' : '';

    if (abs < 1000) return `${sign}${abs}ms`;
    if (abs < 60000) return `${sign}${abs / 1000}s`;
    if (abs < 3600000) return `${sign}${abs / 60000}m`;
    if (abs < 86400000) return `${sign}${abs / 3600000}h`;
    return `${sign}${abs / 86400000}d`;
  }
}
