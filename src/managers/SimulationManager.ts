import {
  SimulationResult,
  SimulationConfig,
  SimulationState,
} from "../models/Simulation";
import { Grid } from "../models/Grid";
import { BiomassService } from "../services/BiomassService";
import { BisonService } from "../services/BisonService";
import { MigrationService } from "../services/MigrationService";
import { GridUtils } from "../utils/GridUtils";

export interface SimulationManager {
  runSimulation(
    config: SimulationConfig,
    initialBiomass?: Grid<number>
  ): Promise<SimulationResult>;
  runStep(
    currentState: SimulationState,
    config: SimulationConfig
  ): SimulationState;
  pause(): void;
  resume(): void;
  reset(): void;
}

export class DefaultSimulationManager implements SimulationManager {
  private isPaused = false;
  private isReset = false;

  constructor(
    private readonly biomassService: BiomassService,
    private readonly bisonService: BisonService,
    private readonly migrationService: MigrationService,
    private readonly gridUtils: GridUtils
  ) {}

  async runSimulation(
    config: SimulationConfig,
    initialBiomass?: Grid<number>
  ): Promise<SimulationResult> {
    this.isReset = false;
    this.isPaused = false;

    // Initialize biomass
    let biomass: Grid<number>;
    if (initialBiomass) {
      biomass = initialBiomass.clone();
    } else {
      biomass = this.biomassService.createFromSineWave(
        { width: 100, height: 100 },
        1500,
        500,
        1.0
      );
    }

    const maxBiomass = this.biomassService.createMaxBiomass(
      biomass,
      config.biomass
    );

    // Initialize bison
    const population = this.bisonService.initializePopulation(
      { width: biomass.width, height: biomass.height },
      config.initialization,
      biomass.cellSizeKm,
      config.seed
    );

    const states: SimulationState[] = [];
    let currentState = this.createInitialState(
      biomass,
      maxBiomass,
      population,
      config
    );
    states.push(currentState);

    // Simulation loop
    for (let year = 1; year < config.years; year++) {
      if (this.isReset) break;
      while (this.isPaused && !this.isReset) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      currentState = this.runStep(currentState, config);
      currentState.year = year;
      states.push({ ...currentState });
    }

    return {
      states,
      metadata: {
        totalYears: config.years,
        gridMetadata: {
          width: biomass.width,
          height: biomass.height,
          cellSizeKm: biomass.cellSizeKm,
        },
        config,
        seed: config.seed,
      },
    };
  }

  runStep(
    currentState: SimulationState,
    config: SimulationConfig
  ): SimulationState {
    // Calculate digestible biomass
    const digestible = this.biomassService.calculateDigestibleBiomass(
      currentState.biomass.current,
      config.biomass
    );

    // Calculate sustainable harvest
    const sustainableHarvest = this.biomassService.calculateSustainableHarvest(
      digestible,
      config.biomass
    );

    // Calculate food demand
    const foodDemand = this.bisonService.calculateFoodDemand(
      currentState.bison.population,
      config.bison
    );

    // Calculate consumption (min of available and demand)
    const consumed = this.gridUtils.minimum(sustainableHarvest, foodDemand);

    // Calculate food satisfaction
    const foodSatisfaction = this.bisonService.calculateFoodSatisfaction(
      foodDemand,
      consumed
    );

    // Calculate carrying capacity
    const carryingCapacity = this.bisonService.calculateCarryingCapacity(
      sustainableHarvest,
      config.bison
    );

    // Update biomass (regrowth - consumption)
    const newBiomass = this.biomassService.updateBiomass(
      currentState.biomass.current,
      currentState.biomass.max,
      consumed,
      config.biomass
    );

    // Calculate migration attractiveness
    const attractiveness = this.migrationService.calculateAttractiveness(
      carryingCapacity,
      config.migration
    );

    // Migrate bison
    const migratedPopulation = this.migrationService.migrate(
      currentState.bison.population,
      attractiveness,
      config.migration,
      config.seed
    );

    // Update bison population (growth/starvation)
    const newPopulation = this.bisonService.updatePopulation(
      migratedPopulation,
      carryingCapacity,
      foodSatisfaction,
      config.bison
    );

    return {
      year: currentState.year + 1,
      biomass: this.biomassService.createState(
        newBiomass,
        currentState.biomass.max,
        config.biomass
      ),
      bison: this.bisonService.createState(
        newPopulation,
        this.bisonService.calculateFoodDemand(newPopulation, config.bison),
        foodSatisfaction,
        carryingCapacity
      ),
    };
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  reset(): void {
    this.isReset = true;
    this.isPaused = false;
  }

  private createInitialState(
    biomass: Grid<number>,
    maxBiomass: Grid<number>,
    population: Grid<number>,
    config: SimulationConfig
  ): SimulationState {
    const biomassState = this.biomassService.createState(
      biomass,
      maxBiomass,
      config.biomass
    );

    const foodDemand = this.bisonService.calculateFoodDemand(
      population,
      config.bison
    );
    const consumed = this.gridUtils.minimum(
      biomassState.sustainableHarvest,
      foodDemand
    );
    const foodSatisfaction = this.bisonService.calculateFoodSatisfaction(
      foodDemand,
      consumed
    );
    const carryingCapacity = this.bisonService.calculateCarryingCapacity(
      biomassState.sustainableHarvest,
      config.bison
    );

    const bisonState = this.bisonService.createState(
      population,
      foodDemand,
      foodSatisfaction,
      carryingCapacity
    );

    return {
      year: 0,
      biomass: biomassState,
      bison: bisonState,
    };
  }
}
