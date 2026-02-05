import { Grid, NumericGrid } from "../models/Grid";

export class GridUtils {
  /**
   * Apply a function to each cell in a grid
   */
  map(grid: Grid<number>, fn: (value: number) => number): Grid<number> {
    const result = new NumericGrid(
      grid.width,
      grid.height,
      grid.cellSizeKm,
      0
    );
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        result.set(row, col, fn(grid.get(row, col)));
      }
    }
    return result;
  }

  /**
   * Apply a function to corresponding cells in two grids
   */
  map2(
    grid1: Grid<number>,
    grid2: Grid<number>,
    fn: (val1: number, val2: number) => number
  ): Grid<number> {
    if (grid1.width !== grid2.width || grid1.height !== grid2.height) {
      throw new Error("Grids must have the same dimensions");
    }
    const result = new NumericGrid(
      grid1.width,
      grid1.height,
      grid1.cellSizeKm,
      0
    );
    for (let row = 0; row < grid1.height; row++) {
      for (let col = 0; col < grid1.width; col++) {
        result.set(row, col, fn(grid1.get(row, col), grid2.get(row, col)));
      }
    }
    return result;
  }

  /**
   * Calculate element-wise minimum of two grids
   */
  minimum(grid1: Grid<number>, grid2: Grid<number>): Grid<number> {
    return this.map2(grid1, grid2, Math.min);
  }

  /**
   * Calculate element-wise maximum of two grids
   */
  maximum(grid1: Grid<number>, grid2: Grid<number>): Grid<number> {
    return this.map2(grid1, grid2, Math.max);
  }

  /**
   * Clip values in a grid to a range
   */
  clip(grid: Grid<number>, min: number, max: number): Grid<number> {
    return this.map(grid, (val) => Math.max(min, Math.min(max, val)));
  }

  /**
   * Add two grids element-wise
   */
  add(grid1: Grid<number>, grid2: Grid<number>): Grid<number> {
    return this.map2(grid1, grid2, (a, b) => a + b);
  }

  /**
   * Subtract two grids element-wise
   */
  subtract(grid1: Grid<number>, grid2: Grid<number>): Grid<number> {
    return this.map2(grid1, grid2, (a, b) => a - b);
  }

  /**
   * Multiply two grids element-wise
   */
  multiply(grid1: Grid<number>, grid2: Grid<number>): Grid<number> {
    return this.map2(grid1, grid2, (a, b) => a * b);
  }

  /**
   * Divide two grids element-wise (with epsilon to avoid divide by zero)
   */
  divide(
    grid1: Grid<number>,
    grid2: Grid<number>,
    epsilon: number = 1e-10
  ): Grid<number> {
    return this.map2(grid1, grid2, (a, b) => a / (b + epsilon));
  }

  /**
   * Multiply grid by scalar
   */
  scale(grid: Grid<number>, scalar: number): Grid<number> {
    return this.map(grid, (val) => val * scalar);
  }

  /**
   * Sum all values in a grid
   */
  sum(grid: Grid<number>): number {
    let total = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        total += grid.get(row, col);
      }
    }
    return total;
  }

  /**
   * Count cells matching a condition
   */
  count(grid: Grid<number>, predicate: (value: number) => boolean): number {
    let count = 0;
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        if (predicate(grid.get(row, col))) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Apply a conditional operation (like np.where)
   */
  where(
    condition: Grid<number>,
    trueValue: number | Grid<number>,
    falseValue: number | Grid<number>,
    threshold: number = 0
  ): Grid<number> {
    const result = new NumericGrid(
      condition.width,
      condition.height,
      condition.cellSizeKm,
      0
    );

    for (let row = 0; row < condition.height; row++) {
      for (let col = 0; col < condition.width; col++) {
        const conditionMet = condition.get(row, col) > threshold;
        let value: number;

        if (conditionMet) {
          value =
            typeof trueValue === "number"
              ? trueValue
              : trueValue.get(row, col);
        } else {
          value =
            typeof falseValue === "number"
              ? falseValue
              : falseValue.get(row, col);
        }

        result.set(row, col, value);
      }
    }

    return result;
  }

  /**
   * Roll/shift grid in a direction (like np.roll)
   */
  roll(grid: Grid<number>, shiftRow: number, shiftCol: number): Grid<number> {
    const result = new NumericGrid(
      grid.width,
      grid.height,
      grid.cellSizeKm,
      0
    );

    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        let newRow = (row + shiftRow) % grid.height;
        let newCol = (col + shiftCol) % grid.width;

        if (newRow < 0) newRow += grid.height;
        if (newCol < 0) newCol += grid.width;

        result.set(newRow, newCol, grid.get(row, col));
      }
    }

    return result;
  }

  /**
   * Get min and max values in grid
   */
  minMax(grid: Grid<number>): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;

    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const val = grid.get(row, col);
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    return { min, max };
  }

  /**
   * Calculate quantile value
   */
  quantile(grid: Grid<number>, q: number): number {
    const values: number[] = [];
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        values.push(grid.get(row, col));
      }
    }
    values.sort((a, b) => a - b);
    const index = Math.floor(values.length * q);
    return values[Math.min(index, values.length - 1)];
  }
}



