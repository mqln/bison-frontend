import { Grid, NumericGrid } from "../models/Grid";
import { BisonState } from "../models/Simulation";
import { BisonConfig, BisonInitialization } from "../models/Config";
import { GridUtils } from "../utils/GridUtils";
import { MathUtils } from "../utils/MathUtils";
import { RandomUtils } from "../utils/RandomUtils";

export interface BisonService {
  initializePopulation(
    shape: { width: number; height: number },
    initialization: BisonInitialization,
    cellSizeKm: number,
    seed?: number,
    landMask?: Grid<number>
  ): Grid<number>;
  calculateFoodDemand(
    population: Grid<number>,
    config: BisonConfig
  ): Grid<number>;
  calculateFoodSatisfaction(
    demand: Grid<number>,
    consumed: Grid<number>
  ): Grid<number>;
  calculateCarryingCapacity(
    sustainableHarvest: Grid<number>,
    config: BisonConfig
  ): Grid<number>;
  updatePopulation(
    population: Grid<number>,
    carryingCapacity: Grid<number>,
    foodSatisfaction: Grid<number>,
    config: BisonConfig
  ): Grid<number>;
  createState(
    population: Grid<number>,
    foodDemand: Grid<number>,
    foodSatisfaction: Grid<number>,
    carryingCapacity: Grid<number>
  ): BisonState;
}

export class DefaultBisonService implements BisonService {
  constructor(
    private readonly gridUtils: GridUtils,
    private readonly mathUtils: MathUtils,
    private readonly randomUtils: RandomUtils
  ) {}

  initializePopulation(
    shape: { width: number; height: number },
    initialization: BisonInitialization,
    cellSizeKm: number,
    seed?: number,
    landMask?: Grid<number>
  ): Grid<number> {
    if (seed !== undefined) {
      this.randomUtils.setSeed(seed);
    }

    const population = new NumericGrid(shape.width, shape.height, cellSizeKm, 0);
    const radius = initialization.releaseRadiusCells;
    const totalPop = initialization.totalPopulation;

    // Find the center point based on pattern
    let centerRow: number;
    let centerCol: number;

    switch (initialization.pattern) {
      case "upper_left":
        centerRow = radius;
        centerCol = radius;
        break;
      case "bottom_left":
        centerRow = shape.height - radius - 1;
        centerCol = radius;
        break;
      case "four_corners":
        // For four corners, just use central (deprecated pattern)
        centerRow = Math.floor(shape.height / 2);
        centerCol = Math.floor(shape.width / 2);
        break;
      case "central":
        centerRow = Math.floor(shape.height / 2);
        centerCol = Math.floor(shape.width / 2);
        break;
      case "custom":
        if (initialization.customCoordinates && initialization.customCoordinates.length > 0) {
          centerRow = initialization.customCoordinates[0].row;
          centerCol = initialization.customCoordinates[0].col;
        } else {
          centerRow = Math.floor(shape.height / 2);
          centerCol = Math.floor(shape.width / 2);
        }
        break;
      default:
        centerRow = Math.floor(shape.height / 2);
        centerCol = Math.floor(shape.width / 2);
    }

    // Find all valid land cells within the release radius
    const validCells: Array<{ row: number; col: number; distance: number }> = [];

    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (!population.isValid(row, col)) continue;

        // Check if on land
        if (landMask && landMask.get(row, col) <= 0) continue;

        // Calculate distance from center
        const distance = Math.sqrt(
          Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2)
        );

        // Only include cells within circular radius
        if (distance <= radius) {
          validCells.push({ row, col, distance });
        }
      }
    }

    if (validCells.length === 0) {
      console.warn("No valid land cells found for population initialization");
      return population;
    }

    // Distribute population with preference for cells closer to center
    // Using inverse distance weighting
    const weights = validCells.map((cell) => 1 / (1 + cell.distance));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let remainingPop = totalPop;
    const cellPopulations = new Map<string, number>();

    // First pass: distribute based on weights
    for (let i = 0; i < validCells.length && remainingPop > 0; i++) {
      const cell = validCells[i];
      const expectedPop = (weights[i] / totalWeight) * totalPop;

      // Add some randomness with Poisson distribution
      const cellPop = Math.min(
        remainingPop,
        this.randomUtils.randomPoisson(Math.max(0.5, expectedPop))
      );

      if (cellPop > 0) {
        cellPopulations.set(`${cell.row},${cell.col}`, cellPop);
        remainingPop -= cellPop;
      }
    }

    // If we still have remaining population, add to random valid cells
    while (remainingPop > 0 && validCells.length > 0) {
      const idx = Math.floor(this.randomUtils.random() * validCells.length);
      const cell = validCells[idx];
      const key = `${cell.row},${cell.col}`;
      const current = cellPopulations.get(key) || 0;
      cellPopulations.set(key, current + 1);
      remainingPop--;
    }

    // Apply populations to grid
    for (const [key, pop] of cellPopulations) {
      const [row, col] = key.split(",").map(Number);
      population.set(row, col, pop);
    }

    // Log initialization stats
    const totalPlaced = Array.from(cellPopulations.values()).reduce((a, b) => a + b, 0);
    console.log(`Initialized ${totalPlaced} bison across ${cellPopulations.size} cells`);
    console.log(`  Center: (${centerRow}, ${centerCol}), Radius: ${radius} cells`);

    return population;
  }

  calculateFoodDemand(
    population: Grid<number>,
    config: BisonConfig
  ): Grid<number> {
    // Food demand = population * intake per bison per year
    const intakeTonnesPerYear =
      (config.bodyMassKg * config.dailyIntakeRate * 365) / 1000;
    return this.gridUtils.scale(population, intakeTonnesPerYear);
  }

  calculateFoodSatisfaction(
    demand: Grid<number>,
    consumed: Grid<number>
  ): Grid<number> {
    // satisfaction = consumed / demand (with 1.0 for cells with no demand)
    const result = new NumericGrid(demand.width, demand.height, demand.cellSizeKm, 0);
    
    for (let row = 0; row < demand.height; row++) {
      for (let col = 0; col < demand.width; col++) {
        const demandVal = demand.get(row, col);
        const consumedVal = consumed.get(row, col);
        
        if (demandVal > 0) {
          result.set(row, col, this.mathUtils.clamp(consumedVal / demandVal, 0, 1));
        } else {
          result.set(row, col, 1.0);
        }
      }
    }
    
    return result;
  }

  calculateCarryingCapacity(
    sustainableHarvest: Grid<number>,
    config: BisonConfig
  ): Grid<number> {
    // carrying_capacity = sustainable_harvest / intake_per_bison
    const intakeTonnesPerYear =
      (config.bodyMassKg * config.dailyIntakeRate * 365) / 1000;
    return this.gridUtils.scale(sustainableHarvest, 1 / intakeTonnesPerYear);
  }

  updatePopulation(
    population: Grid<number>,
    carryingCapacity: Grid<number>,
    foodSatisfaction: Grid<number>,
    config: BisonConfig
  ): Grid<number> {
    const result = new NumericGrid(
      population.width,
      population.height,
      population.cellSizeKm,
      0
    );
    const epsilon = 1e-10;

    for (let row = 0; row < population.height; row++) {
      for (let col = 0; col < population.width; col++) {
        const pop = population.get(row, col);
        const capacity = carryingCapacity.get(row, col);
        const satisfaction = foodSatisfaction.get(row, col);

        // Check if population is viable
        const isViable = pop >= config.minViableDensity;

        // Calculate capacity ratio
        const capacityRatio = pop / (capacity + epsilon);

        // Pioneer bonus for establishing populations
        const capacityBonus = this.mathUtils.clamp(capacity / 10.0, 0, 0.3);
        const pioneerBonus =
          isViable && capacityRatio < 0.3
            ? config.pioneerBonus + capacityBonus
            : capacityBonus;

        // Calculate growth factor
        let growthFactor: number;
        if (satisfaction > config.starvationThreshold) {
          growthFactor =
            (config.maxGrowthRate + pioneerBonus) *
            satisfaction *
            (1 - capacityRatio) *
            (isViable ? 1 : 0);
        } else {
          growthFactor =
            -config.maxGrowthRate *
            (1 - satisfaction / config.starvationThreshold);
        }

        // Clip growth factor
        growthFactor = this.mathUtils.clamp(growthFactor, -0.5, 0.9);

        // Update population
        const newPop = pop * (1 + growthFactor);
        result.set(row, col, this.mathUtils.clamp(newPop, 0, 1e6));
      }
    }

    return result;
  }

  createState(
    population: Grid<number>,
    foodDemand: Grid<number>,
    foodSatisfaction: Grid<number>,
    carryingCapacity: Grid<number>
  ): BisonState {
    return {
      population,
      foodDemand,
      foodSatisfaction,
      carryingCapacity,
    };
  }
}
