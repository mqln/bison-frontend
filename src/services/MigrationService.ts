import { Grid, NumericGrid } from "../models/Grid";
import { MigrationConfig } from "../models/Config";
import { GridUtils } from "../utils/GridUtils";
import { MathUtils } from "../utils/MathUtils";
import { RandomUtils } from "../utils/RandomUtils";

export interface MigrationService {
  calculateAttractiveness(
    carryingCapacity: Grid<number>,
    config: MigrationConfig
  ): Grid<number>;
  migrate(
    population: Grid<number>,
    attractiveness: Grid<number>,
    config: MigrationConfig,
    seed?: number,
    landMask?: Grid<number>
  ): Grid<number>;
}

export class DefaultMigrationService implements MigrationService {
  constructor(
    private readonly gridUtils: GridUtils,
    private readonly mathUtils: MathUtils,
    private readonly randomUtils: RandomUtils
  ) {}

  calculateAttractiveness(
    carryingCapacity: Grid<number>,
    config: MigrationConfig
  ): Grid<number> {
    // Attractiveness based on food availability
    const base = this.gridUtils.scale(carryingCapacity, config.foodPreferenceWeight);
    
    // Add noise
    const result = new NumericGrid(base.width, base.height, base.cellSizeKm, 0);
    const noiseLevel = Math.min(0.15, config.movementNoise * 0.01);
    
    for (let row = 0; row < base.height; row++) {
      for (let col = 0; col < base.width; col++) {
        const noise = this.randomUtils.randomNormal(0, noiseLevel);
        const value = this.mathUtils.clamp(base.get(row, col) + noise, 0, 1000);
        result.set(row, col, value);
      }
    }
    
    return result;
  }

  migrate(
    population: Grid<number>,
    attractiveness: Grid<number>,
    config: MigrationConfig,
    seed?: number,
    landMask?: Grid<number>
  ): Grid<number> {
    if (seed !== undefined) {
      this.randomUtils.setSeed(seed);
    }

    const newPopulation = population.clone() as NumericGrid;

    // Calculate diffusion rate based on annual migration distance
    const cellsPerYear = config.annualMigrationKm / population.cellSizeKm;
    const diffusionRate = Math.min(0.95, cellsPerYear / 10);

    // Define movement directions (adjacent + diagonal + longer distances)
    const moves: Array<{dx: number, dy: number}> = [
      // Adjacent
      {dx: -1, dy: 0}, {dx: 1, dy: 0}, {dx: 0, dy: -1}, {dx: 0, dy: 1},
      // Diagonal
      {dx: -1, dy: -1}, {dx: 1, dy: 1}, {dx: -1, dy: 1}, {dx: 1, dy: -1},
      // Medium distance
      {dx: -2, dy: 0}, {dx: 2, dy: 0}, {dx: 0, dy: -2}, {dx: 0, dy: 2},
      {dx: -2, dy: -2}, {dx: 2, dy: 2}, {dx: -2, dy: 2}, {dx: 2, dy: -2},
    ];

    // Add long-distance moves if population is established
    const totalPop = this.gridUtils.sum(population);
    if (totalPop > 30) {
      moves.push(
        {dx: -5, dy: 0}, {dx: 5, dy: 0}, {dx: 0, dy: -5}, {dx: 0, dy: 5},
        {dx: -4, dy: -4}, {dx: 4, dy: 4}, {dx: -4, dy: 4}, {dx: 4, dy: -4}
      );
    }

    // Very long distance for healthy herds
    const maxPop = this.gridUtils.minMax(population).max;
    if (maxPop > 8) {
      moves.push(
        {dx: -10, dy: 0}, {dx: 10, dy: 0}, {dx: 0, dy: -10}, {dx: 0, dy: 10},
        {dx: -8, dy: -8}, {dx: 8, dy: 8}
      );
    }

    // Process each direction
    for (const move of moves) {
      this.processMigrationDirection(
        newPopulation,
        population,
        attractiveness,
        move.dx,
        move.dy,
        diffusionRate,
        config,
        landMask
      );
    }

    return newPopulation;
  }

  private processMigrationDirection(
    newPopulation: NumericGrid,
    population: Grid<number>,
    attractiveness: Grid<number>,
    dx: number,
    dy: number,
    diffusionRate: number,
    config: MigrationConfig,
    landMask?: Grid<number>
  ): void {
    const distance = Math.max(1.0, Math.sqrt(dx * dx + dy * dy));
    const distanceFactor = 1.0 / Math.pow(distance, 0.8);

    for (let row = 0; row < population.height; row++) {
      for (let col = 0; col < population.width; col++) {
        const targetRow = row + dx;
        const targetCol = col + dy;

        // Check if target is valid
        if (!config.wrapBoundaries) {
          if (targetRow < 0 || targetRow >= population.height ||
              targetCol < 0 || targetCol >= population.width) {
            continue;
          }
        }

        // Calculate wrapped coordinates if needed
        let wrappedRow = targetRow;
        let wrappedCol = targetCol;

        if (config.wrapBoundaries) {
          wrappedRow = ((targetRow % population.height) + population.height) % population.height;
          wrappedCol = ((targetCol % population.width) + population.width) % population.width;
        }

        if (!population.isValid(wrappedRow, wrappedCol)) {
          continue;
        }

        // Check land mask - don't migrate into water (biomass = 0)
        if (landMask && landMask.get(wrappedRow, wrappedCol) <= 0) {
          continue;
        }

        // Calculate attractiveness difference
        const sourceAttr = attractiveness.get(row, col);
        const targetAttr = attractiveness.get(wrappedRow, wrappedCol);
        const attrDiff = this.mathUtils.clamp(targetAttr - sourceAttr, -100, 100);

        // Add exploration noise
        const noiseLevel = 0.15;
        const randomFactor = this.randomUtils.randomNormal(0, noiseLevel);
        const adjustedDiff = attrDiff + randomFactor;

        // Calculate migration rate
        let migrationRate = diffusionRate * distanceFactor * Math.max(-0.1, adjustedDiff);
        const maxRate = Math.min(0.9, (config.annualMigrationKm / population.cellSizeKm) / 10);
        migrationRate = this.mathUtils.clamp(migrationRate, 0, maxRate);

        // Calculate migration amount
        const sourcePop = population.get(row, col);
        const migration = sourcePop * migrationRate;

        // Update populations
        const currentSource = newPopulation.get(row, col);
        const currentTarget = newPopulation.get(wrappedRow, wrappedCol);

        newPopulation.set(row, col, Math.max(0, currentSource - migration));
        newPopulation.set(wrappedRow, wrappedCol, currentTarget + migration);
      }
    }
  }
}
