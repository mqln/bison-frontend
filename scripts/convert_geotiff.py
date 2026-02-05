"""Convert GeoTIFF to compressed numpy format for browser loading."""

import numpy as np
import rasterio
from pathlib import Path

def convert_geotiff_to_npz(input_path: str, output_path: str):
    """Convert GeoTIFF to compressed .npz file."""
    print(f"Reading {input_path}...")

    with rasterio.open(input_path) as src:
        data = src.read(1).astype(np.float32)
        cell_size_m = abs(src.transform[0])
        cell_size_km = cell_size_m / 1000.0

        # Handle nodata
        if src.nodata is not None:
            data[data == src.nodata] = 0.0

        # Ensure non-negative
        data = np.clip(data, 0, None)

    print(f"Data shape: {data.shape}")
    print(f"Cell size: {cell_size_km:.4f} km")
    print(f"Data range: {data.min():.2f} - {data.max():.2f}")
    print(f"Non-zero cells: {(data > 0).sum():,}")

    # Save as compressed npz
    print(f"Saving to {output_path}...")
    np.savez_compressed(
        output_path,
        biomass=data,
        cell_size_km=np.array([cell_size_km])
    )

    # Check file size
    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"Output size: {size_mb:.1f} MB")

if __name__ == "__main__":
    input_file = "/Users/maclean/mammoth/bison-backend/data/combined_digestible_biomass_1km.tif"
    output_file = "/Users/maclean/mammoth/bison-frontend/public/data/biomass.npz"

    convert_geotiff_to_npz(input_file, output_file)
    print("Done!")
