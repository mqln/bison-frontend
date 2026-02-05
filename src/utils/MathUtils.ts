export class MathUtils {
  /**
   * Clamp a value between min and max
   */
  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Linear interpolation
   */
  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Calculate distance between two points
   */
  distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  /**
   * Calculate 2D sine wave pattern
   */
  sineWave2D(
    x: number,
    y: number,
    frequencyX: number,
    frequencyY: number,
    amplitude: number,
    baseline: number
  ): number {
    return (
      baseline + (amplitude * (Math.sin(x * frequencyX) * Math.sin(y * frequencyY) + 1)) / 2
    );
  }
}
