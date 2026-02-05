import { SimulationState } from "../models/Simulation";
import { Grid } from "../models/Grid";
import { scaleSequential } from "d3-scale";
import { interpolateYlGn, interpolatePlasma, interpolateYlOrBr, interpolateRdYlGn } from "d3-scale-chromatic";

export type DisplayVariable = "biomass" | "population" | "carryingCapacity" | "foodSatisfaction" | "populationOverlay";

export interface VisualizationService {
  createColorMap(data: number[][], min?: number, max?: number): string[][];
  createHeatmap(
    state: SimulationState,
    variable: "biomass" | "population" | "carryingCapacity" | "foodSatisfaction"
  ): string[][];
  getStatistics(state: SimulationState): {
    totalPopulation: number;
    totalBiomass: number;
    averageFoodSatisfaction: number;
    occupiedCells: number;
  };
  renderToCanvas(
    canvas: HTMLCanvasElement,
    state: SimulationState,
    variable: DisplayVariable
  ): void;
}

export class CanvasVisualizationService implements VisualizationService {
  private colorScales = {
    biomass: scaleSequential(interpolateYlGn),
    population: scaleSequential(interpolatePlasma),
    carryingCapacity: scaleSequential(interpolateYlOrBr),
    foodSatisfaction: scaleSequential(interpolateRdYlGn),
  };

  createColorMap(data: number[][], min?: number, max?: number): string[][] {
    // Find min/max if not provided
    let minVal = min ?? Infinity;
    let maxVal = max ?? -Infinity;

    if (min === undefined || max === undefined) {
      for (const row of data) {
        for (const val of row) {
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      }
    }

    // Normalize and map to colors
    const result: string[][] = [];

    const scale = scaleSequential(interpolateYlGn).domain([minVal, maxVal]);

    for (const row of data) {
      const colorRow: string[] = [];
      for (const val of row) {
        colorRow.push(scale(val));
      }
      result.push(colorRow);
    }

    return result;
  }

  createHeatmap(
    state: SimulationState,
    variable: "biomass" | "population" | "carryingCapacity" | "foodSatisfaction"
  ): string[][] {
    const grid = this.getGridForVariable(state, variable);
    const data = grid.toArray();

    // Set appropriate min/max for each variable
    let min = 0;
    let max: number | undefined;

    if (variable === "foodSatisfaction") {
      max = 1.0;
    } else {
      // Calculate quantile for better visualization
      const values = data.flat().filter((v) => v > 0);
      if (values.length > 0) {
        values.sort((a, b) => a - b);
        const q99 = values[Math.floor(values.length * 0.99)];
        max = q99;
      }
    }

    const scale = this.colorScales[variable].domain([min, max ?? 1]);
    const result: string[][] = [];

    for (const row of data) {
      const colorRow: string[] = [];
      for (const val of row) {
        colorRow.push(scale(val));
      }
      result.push(colorRow);
    }

    return result;
  }

  getStatistics(state: SimulationState): {
    totalPopulation: number;
    totalBiomass: number;
    averageFoodSatisfaction: number;
    occupiedCells: number;
  } {
    let totalPopulation = 0;
    let totalBiomass = 0;
    let totalSatisfaction = 0;
    let occupiedCells = 0;
    let populatedCells = 0;

    const pop = state.bison.population;
    const biomass = state.biomass.current;
    const satisfaction = state.bison.foodSatisfaction;

    for (let row = 0; row < pop.height; row++) {
      for (let col = 0; col < pop.width; col++) {
        const p = pop.get(row, col);
        const b = biomass.get(row, col);
        const s = satisfaction.get(row, col);

        totalPopulation += p;
        totalBiomass += b;

        if (p > 0) {
          occupiedCells++;
          totalSatisfaction += s;
          populatedCells++;
        }
      }
    }

    return {
      totalPopulation,
      totalBiomass,
      averageFoodSatisfaction:
        populatedCells > 0 ? totalSatisfaction / populatedCells : 0,
      occupiedCells,
    };
  }

  renderToCanvas(
    canvas: HTMLCanvasElement,
    state: SimulationState,
    variable: DisplayVariable
  ): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle overlay mode specially
    if (variable === "populationOverlay") {
      this.renderOverlay(canvas, state);
      return;
    }

    const grid = this.getGridForVariable(state, variable);
    const width = grid.width;
    const height = grid.height;

    // Set canvas size to match grid
    canvas.width = width;
    canvas.height = height;

    // Get color map
    const colors = this.createHeatmap(state, variable);

    // Create image data
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const color = colors[row][col];
        const rgb = this.hexToRgb(color);

        const index = (row * width + col) * 4;
        data[index] = rgb.r;
        data[index + 1] = rgb.g;
        data[index + 2] = rgb.b;
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private renderOverlay(canvas: HTMLCanvasElement, state: SimulationState): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const biomassGrid = state.biomass.current;
    const populationGrid = state.bison.population;
    const width = biomassGrid.width;
    const height = biomassGrid.height;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // First, render biomass as base layer (muted/desaturated)
    const biomassData = biomassGrid.toArray();
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Find biomass range for coloring
    let maxBiomass = 0;
    for (const row of biomassData) {
      for (const val of row) {
        if (val > maxBiomass) maxBiomass = val;
      }
    }

    // Render biomass base layer (muted greens/grays)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const biomass = biomassData[row][col];
        const index = (row * width + col) * 4;

        if (biomass <= 0) {
          // Water - dark blue
          data[index] = 20;
          data[index + 1] = 30;
          data[index + 2] = 48;
        } else {
          // Land - darker green = more biomass (more intuitive)
          const intensity = Math.min(1, biomass / (maxBiomass * 0.5));
          // Invert: high biomass = dark rich green, low biomass = pale green
          data[index] = Math.floor(70 - intensity * 50);      // R: 70->20
          data[index + 1] = Math.floor(120 - intensity * 40); // G: 120->80
          data[index + 2] = Math.floor(60 - intensity * 40);  // B: 60->20
        }
        data[index + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Now overlay population as colored circles
    const popData = populationGrid.toArray();

    // Find max population for scaling
    let maxPop = 0;
    for (const row of popData) {
      for (const val of row) {
        if (val > maxPop) maxPop = val;
      }
    }

    if (maxPop === 0) return; // No population to render

    // Population color scale (plasma-like: purple -> orange -> yellow)
    const getPopulationColor = (pop: number): string => {
      const t = Math.min(1, pop / Math.max(1, maxPop * 0.7));
      if (t < 0.33) {
        // Purple to pink
        const s = t / 0.33;
        return `rgb(${Math.floor(128 + s * 80)}, ${Math.floor(40 + s * 40)}, ${Math.floor(180 - s * 40)})`;
      } else if (t < 0.66) {
        // Pink to orange
        const s = (t - 0.33) / 0.33;
        return `rgb(${Math.floor(208 + s * 47)}, ${Math.floor(80 + s * 100)}, ${Math.floor(140 - s * 100)})`;
      } else {
        // Orange to yellow
        const s = (t - 0.66) / 0.34;
        return `rgb(255, ${Math.floor(180 + s * 75)}, ${Math.floor(40 + s * 80)})`;
      }
    };

    // Render population cells
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const pop = popData[row][col];
        if (pop > 0.1) {
          const color = getPopulationColor(pop);
          const size = Math.max(1, Math.min(3, 1 + (pop / maxPop) * 2));

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(col + 0.5, row + 0.5, size, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  }

  private getGridForVariable(
    state: SimulationState,
    variable: "biomass" | "population" | "carryingCapacity" | "foodSatisfaction"
  ): Grid<number> {
    switch (variable) {
      case "biomass":
        return state.biomass.current;
      case "population":
        return state.bison.population;
      case "carryingCapacity":
        return state.bison.carryingCapacity;
      case "foodSatisfaction":
        return state.bison.foodSatisfaction;
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    // Handle rgb() format from d3
    if (hex.startsWith("rgb")) {
      const match = hex.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        return {
          r: parseInt(match[1]),
          g: parseInt(match[2]),
          b: parseInt(match[3]),
        };
      }
    }

    // Handle hex format
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }
}
