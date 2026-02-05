import { Grid, NumericGrid, GridMetadata } from "../models/Grid";
import { BiomassState, BiomassConfig } from "../models/Simulation";
import { GridUtils } from "../utils/GridUtils";
import { MathUtils } from "../utils/MathUtils";

export interface BiomassService {
  createFromData(data: number[][], metadata: GridMetadata): Grid<number>;
  createFromSineWave(
    shape: { width: number; height: number },
    amplitude: number,
    baseline: number,
    cellSizeKm?: number
  ): Grid<number>;
  calculateDigestibleBiomass(
    biomass: Grid<number>,
    config: BiomassConfig
  ): Grid<number>;
  calculateSustainableHarvest(
    digestibleBiomass: Grid<number>,
    config: BiomassConfig
  ): Grid<number>;
  calculateRegrowth(
    current: Grid<number>,
    max: Grid<number>,
    config: BiomassConfig
  ): Grid<number>;
  updateBiomass(
    current: Grid<number>,
    max: Grid<number>,
    consumed: Grid<number>,
    config: BiomassConfig
  ): Grid<number>;
  createState(
    biomass: Grid<number>,
    max: Grid<number>,
    config: BiomassConfig
  ): BiomassState;
  createMaxBiomass(biomass: Grid<number>, config: BiomassConfig): Grid<number>;
}

export class DefaultBiomassService implements BiomassService {
  constructor(
    private readonly gridUtils: GridUtils,
    private readonly mathUtils: MathUtils
  ) {}

  createFromData(data: number[][], metadata: GridMetadata): Grid<number> {
    const grid = NumericGrid.fromArray(data, metadata.cellSizeKm);
    return grid;
  }

  createFromSineWave(
    shape: { width: number; height: number },
    amplitude: number,
    baseline: number,
    cellSizeKm: number = 1.0
  ): Grid<number> {
    const grid = new NumericGrid(
      shape.width,
      shape.height,
      cellSizeKm,
      (row, col) => {
        const x = (row / shape.height) * 4 * Math.PI;
        const y = (col / shape.width) * 4 * Math.PI;
        return this.mathUtils.sineWave2D(x, y, 1, 1, amplitude, baseline);
      }
    );
    return grid;
  }

  calculateDigestibleBiomass(
    biomass: Grid<number>,
    config: BiomassConfig
  ): Grid<number> {
    return this.gridUtils.scale(biomass, config.digestibilityFactor);
  }

  calculateSustainableHarvest(
    digestibleBiomass: Grid<number>,
    config: BiomassConfig
  ): Grid<number> {
    return this.gridUtils.scale(digestibleBiomass, config.utilizationFactor);
  }

  calculateRegrowth(
    current: Grid<number>,
    max: Grid<number>,
    config: BiomassConfig
  ): Grid<number> {
    // Regrowth = (max - current) * growth_factor
    const diff = this.gridUtils.subtract(max, current);
    return this.gridUtils.scale(diff, config.annualGrowthFactor);
  }

  updateBiomass(
    current: Grid<number>,
    max: Grid<number>,
    consumed: Grid<number>,
    config: BiomassConfig
  ): Grid<number> {
    // new_biomass = current + regrowth - consumed
    const regrowth = this.calculateRegrowth(current, max, config);
    const afterGrowth = this.gridUtils.add(current, regrowth);
    const afterConsumption = this.gridUtils.subtract(afterGrowth, consumed);
    return this.gridUtils.clip(afterConsumption, 0, Number.MAX_VALUE);
  }

  createMaxBiomass(biomass: Grid<number>, config: BiomassConfig): Grid<number> {
    return this.gridUtils.scale(biomass, config.maxBiomassScaling);
  }

  createState(
    biomass: Grid<number>,
    max: Grid<number>,
    config: BiomassConfig
  ): BiomassState {
    return {
      current: biomass,
      max,
      digestible: this.calculateDigestibleBiomass(biomass, config),
      sustainableHarvest: this.calculateSustainableHarvest(
        this.calculateDigestibleBiomass(biomass, config),
        config
      ),
    };
  }
}
