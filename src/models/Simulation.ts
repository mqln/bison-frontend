import { Grid, GridMetadata } from "./Grid";
import type { SimulationConfig, BiomassConfig, BisonConfig, MigrationConfig, BisonInitialization } from "./Config";

// Re-export config types for backwards compatibility
export type { SimulationConfig, BiomassConfig, BisonConfig, MigrationConfig, BisonInitialization };

export interface BiomassState {
  current: Grid<number>;
  max: Grid<number>;
  digestible: Grid<number>;
  sustainableHarvest: Grid<number>;
}

export interface BisonState {
  population: Grid<number>;
  foodDemand: Grid<number>;
  foodSatisfaction: Grid<number>;
  carryingCapacity: Grid<number>;
}

export interface SimulationState {
  year: number;
  biomass: BiomassState;
  bison: BisonState;
}

export interface SimulationMetadata {
  totalYears: number;
  gridMetadata: GridMetadata;
  config: SimulationConfig;
  seed?: number;
}

export interface SimulationResult {
  states: SimulationState[];
  metadata: SimulationMetadata;
}



