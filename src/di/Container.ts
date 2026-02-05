import {
  BiomassService,
  DefaultBiomassService,
} from "../services/BiomassService";
import { BisonService, DefaultBisonService } from "../services/BisonService";
import {
  MigrationService,
  DefaultMigrationService,
} from "../services/MigrationService";
import { DataService, GeoTIFFDataService } from "../services/DataService";
import {
  VisualizationService,
  CanvasVisualizationService,
} from "../services/VisualizationService";
import {
  SimulationManager,
  DefaultSimulationManager,
} from "../managers/SimulationManager";
import { GridUtils } from "../utils/GridUtils";
import { MathUtils } from "../utils/MathUtils";
import { RandomUtils } from "../utils/RandomUtils";

export class Container {
  private _biomassService?: BiomassService;
  private _bisonService?: BisonService;
  private _migrationService?: MigrationService;
  private _dataService?: DataService;
  private _visualizationService?: VisualizationService;
  private _simulationManager?: SimulationManager;

  // Utils (singletons)
  private _gridUtils = new GridUtils();
  private _mathUtils = new MathUtils();
  private _randomUtils = new RandomUtils();

  get biomassService(): BiomassService {
    if (!this._biomassService) {
      this._biomassService = new DefaultBiomassService(
        this._gridUtils,
        this._mathUtils
      );
    }
    return this._biomassService;
  }

  get bisonService(): BisonService {
    if (!this._bisonService) {
      this._bisonService = new DefaultBisonService(
        this._gridUtils,
        this._mathUtils,
        this._randomUtils
      );
    }
    return this._bisonService;
  }

  get migrationService(): MigrationService {
    if (!this._migrationService) {
      this._migrationService = new DefaultMigrationService(
        this._gridUtils,
        this._mathUtils,
        this._randomUtils
      );
    }
    return this._migrationService;
  }

  get dataService(): DataService {
    if (!this._dataService) {
      this._dataService = new GeoTIFFDataService();
    }
    return this._dataService;
  }

  get visualizationService(): VisualizationService {
    if (!this._visualizationService) {
      this._visualizationService = new CanvasVisualizationService();
    }
    return this._visualizationService;
  }

  get simulationManager(): SimulationManager {
    if (!this._simulationManager) {
      this._simulationManager = new DefaultSimulationManager(
        this.biomassService,
        this.bisonService,
        this.migrationService,
        this._gridUtils
      );
    }
    return this._simulationManager;
  }
}

// Export singleton instance
export const container = new Container();
