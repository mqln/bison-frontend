import { GridMetadata } from "../models/Grid";
import { fromArrayBuffer } from "geotiff";

export interface DataService {
  loadGeoTIFF(
    path: string
  ): Promise<{ data: number[][]; metadata: GridMetadata }>;
  preprocessBiomassData(
    biomassData: number[][],
    coverageData: number[][],
    metadata: GridMetadata
  ): Promise<{ data: number[][]; metadata: GridMetadata }>;
  downsample(
    data: number[][],
    targetSize: { width: number; height: number }
  ): number[][];
  resampleToMatch(
    sourceData: number[][],
    sourceMetadata: GridMetadata,
    targetMetadata: GridMetadata
  ): Promise<{ data: number[][]; metadata: GridMetadata }>;
  aggregateToResolution(
    data: number[][],
    metadata: GridMetadata,
    targetResolutionKm: number
  ): Promise<{ data: number[][]; metadata: GridMetadata }>;
}

export class GeoTIFFDataService implements DataService {
  async loadGeoTIFF(
    path: string
  ): Promise<{ data: number[][]; metadata: GridMetadata }> {
    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const tiff = await fromArrayBuffer(arrayBuffer);
      
      const image = await tiff.getImage();
      const rasters = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();
      
      // Convert to 2D array
      const data: number[][] = [];
      const rasterData = rasters[0] as Float32Array | Uint16Array | Int16Array;
      
      for (let row = 0; row < height; row++) {
        const rowData: number[] = [];
        for (let col = 0; col < width; col++) {
          rowData.push(rasterData[row * width + col]);
        }
        data.push(rowData);
      }
      
      // Extract metadata
      const bbox = image.getBoundingBox();
      const resolution = image.getResolution();
      
      const metadata: GridMetadata = {
        width,
        height,
        cellSizeKm: resolution[0] / 1000, // Convert to km
        bounds: {
          minX: bbox[0],
          maxX: bbox[2],
          minY: bbox[1],
          maxY: bbox[3],
        },
      };
      
      return { data, metadata };
    } catch (error) {
      console.error("Error loading GeoTIFF:", error);
      throw error;
    }
  }

  async preprocessBiomassData(
    biomassData: number[][],
    coverageData: number[][],
    metadata: GridMetadata
  ): Promise<{ data: number[][]; metadata: GridMetadata }> {
    if (biomassData.length !== coverageData.length || 
        biomassData[0].length !== coverageData[0].length) {
      throw new Error("Biomass and coverage data must have the same dimensions");
    }
    
    const result: number[][] = [];
    
    for (let row = 0; row < biomassData.length; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < biomassData[0].length; col++) {
        const biomass = biomassData[row][col];
        const coverage = coverageData[row][col];
        
        // Multiply biomass by coverage percentage (convert from 0-100 to 0-1)
        const actualBiomass = biomass * (coverage / 100.0);
        rowData.push(actualBiomass);
      }
      result.push(rowData);
    }
    
    return { data: result, metadata };
  }

  downsample(
    data: number[][],
    targetSize: { width: number; height: number }
  ): number[][] {
    const height = data.length;
    const width = data[0].length;
    
    const scaleX = width / targetSize.width;
    const scaleY = height / targetSize.height;
    
    const result: number[][] = [];
    
    for (let row = 0; row < targetSize.height; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < targetSize.width; col++) {
        // Use bilinear interpolation
        const srcRow = row * scaleY;
        const srcCol = col * scaleX;
        
        const row0 = Math.floor(srcRow);
        const row1 = Math.min(row0 + 1, height - 1);
        const col0 = Math.floor(srcCol);
        const col1 = Math.min(col0 + 1, width - 1);
        
        const fracRow = srcRow - row0;
        const fracCol = srcCol - col0;
        
        const v00 = data[row0][col0];
        const v01 = data[row0][col1];
        const v10 = data[row1][col0];
        const v11 = data[row1][col1];
        
        const value =
          v00 * (1 - fracRow) * (1 - fracCol) +
          v01 * (1 - fracRow) * fracCol +
          v10 * fracRow * (1 - fracCol) +
          v11 * fracRow * fracCol;
        
        rowData.push(value);
      }
      result.push(rowData);
    }
    
    return result;
  }

  async resampleToMatch(
    sourceData: number[][],
    _sourceMetadata: GridMetadata,
    targetMetadata: GridMetadata
  ): Promise<{ data: number[][]; metadata: GridMetadata }> {
    // For now, use simple downsampling
    // In a full implementation, this would handle reprojection and proper resampling
    const resampled = this.downsample(sourceData, {
      width: targetMetadata.width,
      height: targetMetadata.height,
    });
    
    return { data: resampled, metadata: targetMetadata };
  }

  async aggregateToResolution(
    data: number[][],
    metadata: GridMetadata,
    targetResolutionKm: number
  ): Promise<{ data: number[][]; metadata: GridMetadata }> {
    const factor = targetResolutionKm / metadata.cellSizeKm;
    const newWidth = Math.floor(metadata.width / factor);
    const newHeight = Math.floor(metadata.height / factor);
    
    const result: number[][] = [];
    
    for (let row = 0; row < newHeight; row++) {
      const rowData: number[] = [];
      for (let col = 0; col < newWidth; col++) {
        // Average all cells in the aggregation window
        let sum = 0;
        let count = 0;
        
        const startRow = Math.floor(row * factor);
        const endRow = Math.floor((row + 1) * factor);
        const startCol = Math.floor(col * factor);
        const endCol = Math.floor((col + 1) * factor);
        
        for (let r = startRow; r < endRow && r < data.length; r++) {
          for (let c = startCol; c < endCol && c < data[0].length; c++) {
            sum += data[r][c];
            count++;
          }
        }
        
        rowData.push(count > 0 ? sum / count : 0);
      }
      result.push(rowData);
    }
    
    const newMetadata: GridMetadata = {
      ...metadata,
      width: newWidth,
      height: newHeight,
      cellSizeKm: targetResolutionKm,
    };
    
    return { data: result, metadata: newMetadata };
  }
}
