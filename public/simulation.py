"""
Bison population simulation for Pyodide (browser).
Pure NumPy/SciPy - no numba or rasterio dependencies.
"""

import numpy as np
from scipy import signal
from dataclasses import dataclass
from typing import Tuple, Optional
import json


@dataclass
class SimulationConfig:
    """Simulation configuration."""
    # Biomass
    digestibility_factor: float = 1.0
    annual_growth_factor: float = 0.4
    utilization_factor: float = 0.5

    # Bison
    body_mass_kg: float = 700.0
    daily_intake_rate: float = 0.02
    max_growth_rate: float = 0.10
    starvation_threshold: float = 0.2
    min_viable_density: float = 0.05
    pioneer_bonus: float = 0.05

    # Migration
    annual_migration_km: float = 50.0
    diffusion_rate: float = 0.15
    food_preference_weight: float = 1.0

    @property
    def annual_intake_tonnes(self) -> float:
        return (self.body_mass_kg * self.daily_intake_rate * 365) / 1000


class Simulation:
    """Main simulation class."""

    def __init__(self, config: SimulationConfig = None):
        self.config = config or SimulationConfig()
        self.rng = np.random.default_rng(42)

        # State
        self.biomass: Optional[np.ndarray] = None
        self.max_biomass: Optional[np.ndarray] = None
        self.population: Optional[np.ndarray] = None
        self.cell_size_km: float = 1.0
        self.year: int = 0

        # Pre-computed
        self._migration_kernel: Optional[np.ndarray] = None

    def initialize(self, biomass: np.ndarray, cell_size_km: float,
                   start_row: int, start_col: int, total_population: int):
        """Initialize simulation with biomass data and starting location."""
        self.biomass = biomass.astype(np.float32)
        self.max_biomass = biomass.astype(np.float32)
        self.cell_size_km = cell_size_km
        self.year = 0

        # Calculate adaptive release radius based on local biomass
        self._calculate_release_radius(start_row, start_col, total_population)

        # Initialize population
        self.population = self._initialize_population(
            start_row, start_col, total_population
        )

        # Pre-compute migration kernel
        self._migration_kernel = self._create_migration_kernel()

        return self._get_state()

    def _calculate_release_radius(self, row: int, col: int, total_pop: int):
        """Calculate release radius based on local habitat quality."""
        h, w = self.biomass.shape
        sample_radius = 50
        r_min, r_max = max(0, row - sample_radius), min(h, row + sample_radius)
        c_min, c_max = max(0, col - sample_radius), min(w, col + sample_radius)
        local_biomass = self.biomass[r_min:r_max, c_min:c_max]

        land_mask = local_biomass > 0
        if land_mask.any():
            avg_biomass = local_biomass[land_mask].mean()
            avg_cc = (avg_biomass * self.config.utilization_factor) / self.config.annual_intake_tonnes
        else:
            avg_cc = 0.1

        target_ratio = 0.8
        cells_needed = total_pop / (avg_cc * target_ratio) if avg_cc > 0 else 2000
        min_cells = total_pop * 3
        cells_needed = max(cells_needed, min_cells)

        self._release_radius = min(300, max(30, int(np.sqrt(cells_needed / 3.14))))

    def _initialize_population(self, center_row: int, center_col: int,
                               total_population: int) -> np.ndarray:
        """Initialize population at specified location."""
        h, w = self.biomass.shape
        population = np.zeros((h, w), dtype=np.float32)
        radius = self._release_radius

        # Create coordinate grids
        rows = np.arange(max(0, center_row - radius), min(h, center_row + radius + 1))
        cols = np.arange(max(0, center_col - radius), min(w, center_col + radius + 1))
        row_grid, col_grid = np.meshgrid(rows, cols, indexing='ij')

        # Calculate distances
        distances = np.sqrt((row_grid - center_row)**2 + (col_grid - center_col)**2)

        # Valid cells (within radius and on land)
        within_radius = distances <= radius
        land_values = self.biomass[row_grid, col_grid]
        valid_mask = within_radius & (land_values > 0)

        if not np.any(valid_mask):
            return population

        # Weight by distance and biomass quality
        weights = np.zeros_like(distances)
        distance_weight = 1.0 / (1.0 + distances[valid_mask])
        biomass_weight = np.sqrt(land_values[valid_mask])
        weights[valid_mask] = distance_weight * biomass_weight
        weights /= weights.sum()

        # Distribute population
        expected = weights * total_population
        actual = self.rng.poisson(expected)
        actual[~valid_mask] = 0

        # Normalize to target
        if actual.sum() > 0:
            actual = (actual * total_population / actual.sum()).astype(np.float32)

        population[row_grid, col_grid] = actual
        return population

    def _create_migration_kernel(self) -> np.ndarray:
        """Create migration kernel for diffusion."""
        cells_per_year = self.config.annual_migration_km / self.cell_size_km
        kernel_radius = min(5, max(2, int(cells_per_year / 4)))
        kernel_size = 2 * kernel_radius + 1

        y, x = np.ogrid[-kernel_radius:kernel_radius+1, -kernel_radius:kernel_radius+1]
        distances = np.sqrt(x*x + y*y)

        kernel = np.zeros((kernel_size, kernel_size), dtype=np.float32)
        mask = (distances > 0) & (distances <= kernel_radius)
        kernel[mask] = 1.0 / (1.0 + distances[mask])**2.0

        kernel[kernel_radius, kernel_radius] = 0
        if kernel.sum() > 0:
            kernel = kernel / kernel.sum() * self.config.diffusion_rate
        kernel[kernel_radius, kernel_radius] = 1.0 - self.config.diffusion_rate

        return kernel

    def step(self) -> dict:
        """Run one simulation step (one year)."""
        cfg = self.config

        # Calculate food availability
        digestible = self.biomass * cfg.digestibility_factor
        sustainable_harvest = digestible * cfg.utilization_factor

        # Food demand and consumption
        food_demand = self.population * cfg.annual_intake_tonnes
        consumed = np.minimum(sustainable_harvest, food_demand)

        # Food satisfaction
        food_satisfaction = np.ones_like(food_demand)
        mask = food_demand > 0
        food_satisfaction[mask] = np.clip(consumed[mask] / food_demand[mask], 0, 1)

        # Carrying capacity
        carrying_capacity = sustainable_harvest / cfg.annual_intake_tonnes

        # Update biomass
        regrowth = (self.max_biomass - self.biomass) * cfg.annual_growth_factor
        self.biomass = np.clip(self.biomass + regrowth - consumed, 0, None)

        # Migration
        self.population = self._migrate(carrying_capacity)

        # Population update
        self.population = self._update_population(
            carrying_capacity, food_satisfaction
        )

        self.year += 1
        return self._get_state()

    def _migrate(self, carrying_capacity: np.ndarray) -> np.ndarray:
        """Perform migration using FFT convolution."""
        if self.population.sum() < 0.1:
            return self.population.copy()

        # Base diffusion
        diffused = signal.fftconvolve(self.population, self._migration_kernel, mode='same')

        # Directional bias based on carrying capacity gradient
        grad_y = np.diff(carrying_capacity, axis=0, prepend=carrying_capacity[:1, :])
        grad_x = np.diff(carrying_capacity, axis=1, prepend=carrying_capacity[:, :1])

        bias = self.config.food_preference_weight * self.config.diffusion_rate * 0.3

        shift_up = np.roll(diffused, -1, axis=0)
        shift_down = np.roll(diffused, 1, axis=0)
        shift_left = np.roll(diffused, -1, axis=1)
        shift_right = np.roll(diffused, 1, axis=1)

        up_w = np.clip(-grad_y * bias, 0, 0.2)
        down_w = np.clip(grad_y * bias, 0, 0.2)
        left_w = np.clip(-grad_x * bias, 0, 0.2)
        right_w = np.clip(grad_x * bias, 0, 0.2)

        total_shift = up_w + down_w + left_w + right_w
        stay_w = 1.0 - total_shift

        result = (stay_w * diffused + up_w * shift_up + down_w * shift_down +
                  left_w * shift_left + right_w * shift_right).astype(np.float32)

        # Mask water and edges
        result[self.max_biomass <= 0] = 0.0
        result[0, :] = result[-1, :] = result[:, 0] = result[:, -1] = 0

        # Conserve population
        total_before = self.population.sum()
        total_after = result.sum()
        if total_after > 0:
            result *= total_before / total_after

        return result

    def _update_population(self, carrying_capacity: np.ndarray,
                           food_satisfaction: np.ndarray) -> np.ndarray:
        """Update population using logistic growth (pure numpy)."""
        cfg = self.config
        pop = self.population
        epsilon = 1e-10

        # Calculate growth factors vectorized
        capacity_ratio = pop / (carrying_capacity + epsilon)
        is_viable = pop >= cfg.min_viable_density
        well_fed = food_satisfaction > cfg.starvation_threshold
        below_capacity = capacity_ratio < 0.5

        # Base growth rate with pioneer bonus
        effective_rate = np.where(below_capacity,
                                   cfg.max_growth_rate + cfg.pioneer_bonus,
                                   cfg.max_growth_rate)

        # Growth factor for well-fed populations
        growth_factor = effective_rate * food_satisfaction * (1 - capacity_ratio)

        # Allee effect for sparse populations
        allee_decline = -0.2 * (cfg.min_viable_density - pop) / cfg.min_viable_density
        growth_factor = np.where(is_viable & well_fed, growth_factor,
                                  np.where(well_fed, allee_decline, growth_factor))

        # Starvation decline
        starvation_factor = -cfg.max_growth_rate * (1 - food_satisfaction / cfg.starvation_threshold)
        growth_factor = np.where(well_fed, growth_factor, starvation_factor)

        # Zero out empty cells
        growth_factor = np.where(pop < epsilon, 0, growth_factor)

        # Clip and apply
        growth_factor = np.clip(growth_factor, -0.3, 0.15)
        new_pop = np.clip(pop * (1 + growth_factor), 0, 1e6)

        return new_pop.astype(np.float32)

    def _get_state(self) -> dict:
        """Get current state as dictionary."""
        return {
            'year': self.year,
            'biomass': self.biomass,
            'population': self.population,
            'total_population': float(self.population.sum()),
            'occupied_cells': int((self.population > 0.1).sum())
        }


# Global simulation instance for Pyodide
_sim: Optional[Simulation] = None
_biomass_data: Optional[np.ndarray] = None
_cell_size_km: float = 1.0


def load_data(biomass: np.ndarray, cell_size_km: float):
    """Load biomass data (called from JS after fetching npz)."""
    global _biomass_data, _cell_size_km
    _biomass_data = biomass.astype(np.float32)
    _cell_size_km = cell_size_km
    return {'width': biomass.shape[1], 'height': biomass.shape[0], 'cell_size_km': cell_size_km}


def start_simulation(row: int, col: int, total_population: int) -> str:
    """Start a new simulation."""
    global _sim
    if _biomass_data is None:
        return json.dumps({'error': 'Data not loaded'})

    _sim = Simulation()
    state = _sim.initialize(_biomass_data.copy(), _cell_size_km, row, col, total_population)

    return json.dumps({
        'year': state['year'],
        'total_population': state['total_population'],
        'occupied_cells': state['occupied_cells'],
        'biomass': state['biomass'].tolist(),
        'population': state['population'].tolist()
    })


def step_simulation(years: int = 1) -> str:
    """Advance simulation by specified years."""
    global _sim
    if _sim is None:
        return json.dumps({'error': 'Simulation not started'})

    state = None
    for _ in range(years):
        state = _sim.step()

    return json.dumps({
        'year': state['year'],
        'total_population': state['total_population'],
        'occupied_cells': state['occupied_cells'],
        'biomass': state['biomass'].tolist(),
        'population': state['population'].tolist()
    })
