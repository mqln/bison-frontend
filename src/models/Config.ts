export interface BiomassConfig {
  digestibilityFactor: number;
  annualGrowthFactor: number;
  utilizationFactor: number;
  maxBiomassScaling: number;
}

export interface BisonConfig {
  bodyMassKg: number;
  dailyIntakeRate: number;
  maxGrowthRate: number;
  starvationThreshold: number;
  minViableDensity: number;
  pioneerBonus: number;
}

export interface MigrationConfig {
  annualMigrationKm: number;
  diffusionRate: number;
  movementNoise: number;
  foodPreferenceWeight: number;
  wrapBoundaries: boolean;
}

export type InitializationPattern =
  | "upper_left"
  | "bottom_left"
  | "four_corners"
  | "central"
  | "custom";

export interface BisonInitialization {
  pattern: InitializationPattern;
  // Total number of bison to introduce (realistic: 20-100 for reintroduction)
  totalPopulation: number;
  // Radius in cells for the initial release area
  releaseRadiusCells: number;
  customCoordinates?: Array<{ row: number; col: number }>;
}

export interface SimulationConfig {
  years: number;
  seed?: number;
  biomass: BiomassConfig;
  bison: BisonConfig;
  migration: MigrationConfig;
  initialization: BisonInitialization;
}

// Default configuration values
export const DEFAULT_BIOMASS_CONFIG: BiomassConfig = {
  digestibilityFactor: 0.15,
  annualGrowthFactor: 0.4,
  utilizationFactor: 0.1,
  maxBiomassScaling: 1.0,
};

// Configuration for pre-computed digestible biomass data
// Use this when loading GeoTIFF data that has already been processed with
// plant-type-specific digestibility factors (Forb: 0.8, Graminoid: 0.5, DeciduousShrub: 0.3)
export const PRECOMPUTED_BIOMASS_CONFIG: BiomassConfig = {
  digestibilityFactor: 1.0, // Data is already digestibility-weighted
  annualGrowthFactor: 0.4,
  utilizationFactor: 0.1,
  maxBiomassScaling: 1.0,
};

// Scientifically-based bison parameters
// Sources:
// - USDA Wildlife Services, Bison Management Guidelines
// - Plumb & Dodd (1993) Foraging ecology of bison and cattle
// - Meagher (1986) Bison bison, Mammalian Species No. 266
export const DEFAULT_BISON_CONFIG: BisonConfig = {
  // Average adult body mass: Males ~900kg, Females ~500kg, weighted average ~700kg
  bodyMassKg: 700,
  // Daily dry matter intake: 1.5-2.5% of body mass, using 2% as typical
  dailyIntakeRate: 0.02,
  // Maximum intrinsic growth rate (r_max): 0.20-0.30 for large ungulates
  // Bison can increase ~25% per year under optimal conditions
  maxGrowthRate: 0.25,
  // Starvation threshold: below 30% food satisfaction causes population decline
  starvationThreshold: 0.3,
  // Minimum viable density: Allee effect threshold ~0.5 animals/cell
  minViableDensity: 0.5,
  // Pioneer bonus: reduced growth boost for colonizing new areas
  pioneerBonus: 0.15,
};

export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  annualMigrationKm: 200,
  diffusionRate: 0.95,
  movementNoise: 0.1,
  foodPreferenceWeight: 4.0,
  wrapBoundaries: false,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  years: 50,
  seed: 42,
  biomass: DEFAULT_BIOMASS_CONFIG,
  bison: DEFAULT_BISON_CONFIG,
  migration: DEFAULT_MIGRATION_CONFIG,
  initialization: {
    pattern: "central",
    // Realistic founding population for a reintroduction program
    totalPopulation: 50,
    // Release area radius: 3 cells = ~3km radius
    releaseRadiusCells: 3,
  },
};

// Configuration for simulations using pre-computed digestible biomass from GeoTIFF
export const GEOTIFF_SIMULATION_CONFIG: SimulationConfig = {
  years: 50,
  seed: 42,
  biomass: PRECOMPUTED_BIOMASS_CONFIG,
  bison: DEFAULT_BISON_CONFIG,
  migration: DEFAULT_MIGRATION_CONFIG,
  initialization: {
    // Default to custom - coordinates provided via UI click
    // Falls back to central if no coordinates provided
    pattern: "central",
    // Realistic founding population: simulates a reintroduction of ~50 bison
    // Historical context: Yellowstone has ~5000, but started from ~25 in 1902
    totalPopulation: 50,
    // Release area: 5 cell radius = ~5km radius release zone
    releaseRadiusCells: 5,
  },
};



