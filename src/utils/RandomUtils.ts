export class RandomUtils {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Date.now();
  }

  /**
   * Seeded random number generator (using mulberry32)
   */
  random(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random integer between min (inclusive) and max (exclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Random number from normal distribution (Box-Muller transform)
   */
  randomNormal(mean: number = 0, stdDev: number = 1): number {
    const u1 = this.random();
    const u2 = this.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }

  /**
   * Random number from Poisson distribution
   */
  randomPoisson(lambda: number): number {
    if (lambda < 30) {
      // Knuth's algorithm
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.random();
      } while (p > L);
      return k - 1;
    } else {
      // Use normal approximation for large lambda
      return Math.max(0, Math.round(this.randomNormal(lambda, Math.sqrt(lambda))));
    }
  }

  /**
   * Reset seed
   */
  setSeed(seed: number): void {
    this.seed = seed;
  }
}
