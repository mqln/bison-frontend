export interface Grid<T> {
  readonly width: number;
  readonly height: number;
  readonly cellSizeKm: number;
  get(row: number, col: number): T;
  set(row: number, col: number, value: T): void;
  isValid(row: number, col: number): boolean;
  clone(): Grid<T>;
  toArray(): T[][];
  getData(): Float32Array | T[];
}

export interface GridMetadata {
  width: number;
  height: number;
  cellSizeKm: number;
  bounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  crs?: string;
  transform?: number[];
}

export class ArrayGrid<T> implements Grid<T> {
  private data: T[][];

  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly cellSizeKm: number,
    initialValue: T | ((row: number, col: number) => T)
  ) {
    this.data = Array(height)
      .fill(null)
      .map((_, row) =>
        Array(width)
          .fill(null)
          .map((_, col) =>
            typeof initialValue === "function"
              ? (initialValue as (r: number, c: number) => T)(row, col)
              : initialValue
          )
      );
  }

  get(row: number, col: number): T {
    if (!this.isValid(row, col)) {
      throw new Error(
        `Invalid grid coordinates: (${row}, ${col}). Grid size: ${this.height}x${this.width}`
      );
    }
    return this.data[row][col];
  }

  set(row: number, col: number, value: T): void {
    if (!this.isValid(row, col)) {
      throw new Error(
        `Invalid grid coordinates: (${row}, ${col}). Grid size: ${this.height}x${this.width}`
      );
    }
    this.data[row][col] = value;
  }

  isValid(row: number, col: number): boolean {
    return row >= 0 && row < this.height && col >= 0 && col < this.width;
  }

  clone(): Grid<T> {
    const cloned = new ArrayGrid<T>(
      this.width,
      this.height,
      this.cellSizeKm,
      this.data[0][0]
    );
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        cloned.set(row, col, this.get(row, col));
      }
    }
    return cloned;
  }

  toArray(): T[][] {
    return this.data.map((row) => [...row]);
  }

  getData(): T[] {
    return this.data.flat();
  }

  static fromArray<T>(
    data: T[][],
    cellSizeKm: number = 1.0
  ): ArrayGrid<T> {
    const height = data.length;
    const width = height > 0 ? data[0].length : 0;
    const grid = new ArrayGrid<T>(width, height, cellSizeKm, data[0][0]);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        grid.set(row, col, data[row][col]);
      }
    }
    return grid;
  }
}

// Optimized grid for numeric data using typed arrays
export class NumericGrid implements Grid<number> {
  private data: Float32Array;

  constructor(
    public readonly width: number,
    public readonly height: number,
    public readonly cellSizeKm: number,
    initialValue: number | ((row: number, col: number) => number) = 0
  ) {
    this.data = new Float32Array(width * height);
    if (typeof initialValue === "function") {
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          this.data[row * width + col] = initialValue(row, col);
        }
      }
    } else {
      this.data.fill(initialValue);
    }
  }

  get(row: number, col: number): number {
    if (!this.isValid(row, col)) {
      throw new Error(
        `Invalid grid coordinates: (${row}, ${col}). Grid size: ${this.height}x${this.width}`
      );
    }
    return this.data[row * this.width + col];
  }

  set(row: number, col: number, value: number): void {
    if (!this.isValid(row, col)) {
      throw new Error(
        `Invalid grid coordinates: (${row}, ${col}). Grid size: ${this.height}x${this.width}`
      );
    }
    this.data[row * this.width + col] = value;
  }

  isValid(row: number, col: number): boolean {
    return row >= 0 && row < this.height && col >= 0 && col < this.width;
  }

  clone(): Grid<number> {
    const cloned = new NumericGrid(
      this.width,
      this.height,
      this.cellSizeKm,
      0
    );
    cloned.data.set(this.data);
    return cloned;
  }

  toArray(): number[][] {
    const result: number[][] = [];
    for (let row = 0; row < this.height; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < this.width; col++) {
        rowData.push(this.get(row, col));
      }
      result.push(rowData);
    }
    return result;
  }

  getData(): Float32Array {
    return this.data;
  }

  static fromArray(
    data: number[][],
    cellSizeKm: number = 1.0
  ): NumericGrid {
    const height = data.length;
    const width = height > 0 ? data[0].length : 0;
    const grid = new NumericGrid(width, height, cellSizeKm, 0);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        grid.set(row, col, data[row][col]);
      }
    }
    return grid;
  }

  static fromFloat32Array(
    data: Float32Array,
    width: number,
    height: number,
    cellSizeKm: number = 1.0
  ): NumericGrid {
    const grid = new NumericGrid(width, height, cellSizeKm, 0);
    grid.data.set(data);
    return grid;
  }
}



