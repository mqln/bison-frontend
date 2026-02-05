import React from "react";
import { SimulationConfig } from "../../models/Config";

interface ControlPanelProps {
  config: SimulationConfig;
  isRunning: boolean;
  isPaused: boolean;
  onRun: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onConfigChange: (config: SimulationConfig) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  isRunning,
  isPaused,
  onRun,
  onPause,
  onResume,
  onReset,
  onConfigChange,
}) => {
  return (
    <div className="control-panel" style={{ padding: "20px", backgroundColor: "#f5f5f5" }}>
      <h2>Simulation Controls</h2>

      <div className="controls" style={{ marginBottom: "20px" }}>
        {!isRunning ? (
          <button onClick={onRun} style={{ marginRight: "10px" }}>
            ▶️ Run Simulation
          </button>
        ) : isPaused ? (
          <button onClick={onResume} style={{ marginRight: "10px" }}>
            ▶️ Resume
          </button>
        ) : (
          <button onClick={onPause} style={{ marginRight: "10px" }}>
            ⏸️ Pause
          </button>
        )}
        <button onClick={onReset}>🔄 Reset</button>
      </div>

      <div className="parameters">
        <h3>Parameters</h3>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Years:
            <input
              type="number"
              value={config.years}
              onChange={(e) =>
                onConfigChange({ ...config, years: parseInt(e.target.value) })
              }
              min={1}
              max={200}
              disabled={isRunning}
              style={{ marginLeft: "10px", width: "60px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>
            Total Bison Population:
            <input
              type="number"
              value={config.initialization.totalPopulation}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  initialization: {
                    ...config.initialization,
                    totalPopulation: parseInt(e.target.value),
                  },
                })
              }
              min={10}
              max={500}
              step={10}
              disabled={isRunning}
              style={{ marginLeft: "10px", width: "60px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>
            Release Radius (cells):
            <input
              type="number"
              value={config.initialization.releaseRadiusCells}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  initialization: {
                    ...config.initialization,
                    releaseRadiusCells: parseInt(e.target.value),
                  },
                })
              }
              min={1}
              max={20}
              step={1}
              disabled={isRunning}
              style={{ marginLeft: "10px", width: "60px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>
            Max Growth Rate:
            <input
              type="number"
              value={config.bison.maxGrowthRate}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  bison: {
                    ...config.bison,
                    maxGrowthRate: parseFloat(e.target.value),
                  },
                })
              }
              min={0}
              max={1}
              step={0.05}
              disabled={isRunning}
              style={{ marginLeft: "10px", width: "60px" }}
            />
          </label>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <label>
            Initialization Pattern:
            <select
              value={config.initialization.pattern}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  initialization: {
                    ...config.initialization,
                    pattern: e.target.value as any,
                  },
                })
              }
              disabled={isRunning}
              style={{ marginLeft: "10px" }}
            >
              <option value="four_corners">Four Corners</option>
              <option value="central">Central</option>
              <option value="upper_left">Upper Left</option>
              <option value="bottom_left">Bottom Left</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
};
