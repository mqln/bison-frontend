import React, { useState, useEffect, useRef, useCallback } from "react";
import { container } from "../di/Container";
import { SimulationState } from "../models/Simulation";
import { NumericGrid } from "../models/Grid";
import { SimulationCanvas } from "./components/SimulationCanvas";

interface YearState {
  year: number;
  biomass: number[][];
  population: number[][];
}

export const App: React.FC = () => {
  // Pyodide worker state
  const [pyodideStatus, setPyodideStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const workerRef = useRef<Worker | null>(null);

  // Simulation state
  const [isRunning, setIsRunning] = useState(false);
  const [currentYear, setCurrentYear] = useState(0);
  const [yearStates, setYearStates] = useState<YearState[]>([]);
  const [viewingYear, setViewingYear] = useState(0);
  const [stepTime, setStepTime] = useState<number | null>(null);
  const [cellSizeKm, setCellSizeKm] = useState(1);

  // Initial biomass
  const [initialBiomass, setInitialBiomass] = useState<number[][] | null>(null);
  const [gridInfo, setGridInfo] = useState<{ width: number; height: number } | null>(null);

  // Display settings
  const [selectedVariable, setSelectedVariable] = useState<
    "biomass" | "population" | "carryingCapacity" | "foodSatisfaction" | "populationOverlay"
  >("populationOverlay");
  const [autoPlay, setAutoPlay] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Start location selection
  const [startLocation, setStartLocation] = useState<{ row: number; col: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Initial population settings
  const [initialPopulation, setInitialPopulation] = useState(50);
  const [yearsPerStep, setYearsPerStep] = useState(1);

  // Statistics
  const [totalPopulation, setTotalPopulation] = useState(0);

  // Info panel toggle
  const [showMethodology, setShowMethodology] = useState(false);

  // Refs for controlling the simulation loop
  const isRunningRef = useRef(false);
  const pendingResolve = useRef<((data: any) => void) | null>(null);

  // Initialize Pyodide worker
  useEffect(() => {
    const worker = new Worker("/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, data, message, error } = event.data;

      switch (type) {
        case "status":
          setLoadingMessage(message);
          break;
        case "ready":
          setPyodideStatus("ready");
          // Request initial biomass
          worker.postMessage({ type: "getInitialBiomass" });
          break;
        case "initialBiomass":
          setInitialBiomass(data.biomass);
          setCellSizeKm(data.cell_size_km);
          setGridInfo({ width: data.width, height: data.height });
          break;
        case "state":
          if (pendingResolve.current) {
            pendingResolve.current(data);
            pendingResolve.current = null;
          }
          break;
        case "error":
          console.error("Worker error:", error);
          if (pendingResolve.current) {
            pendingResolve.current(null);
            pendingResolve.current = null;
          }
          break;
      }
    };

    worker.onerror = (error) => {
      console.error("Worker error:", error);
      setPyodideStatus("error");
    };

    // Start initialization
    worker.postMessage({ type: "init" });

    return () => {
      worker.terminate();
    };
  }, []);

  const sendWorkerMessage = (message: any): Promise<any> => {
    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      workerRef.current?.postMessage(message);
    });
  };

  const startSimulation = async () => {
    if (!startLocation) {
      setLocationError("Please click on the map to select a starting location");
      return;
    }

    // Check if clicking on water
    if (initialBiomass && initialBiomass[startLocation.row]?.[startLocation.col] <= 0) {
      setLocationError("Cannot start in water. Please select a location on land.");
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;
    setYearStates([]);
    setCurrentYear(0);
    setViewingYear(0);
    setLocationError(null);

    const startTime = performance.now();
    const data = await sendWorkerMessage({
      type: "start",
      payload: {
        row: startLocation.row,
        col: startLocation.col,
        totalPopulation: initialPopulation,
      },
    });

    if (!data) {
      setLocationError("Failed to start simulation");
      setIsRunning(false);
      isRunningRef.current = false;
      return;
    }

    setStepTime(performance.now() - startTime);
    setTotalPopulation(Math.round(data.total_population));

    const initialState: YearState = {
      year: 0,
      biomass: data.biomass,
      population: data.population,
    };

    setYearStates([initialState]);
    setSelectedVariable("populationOverlay");

    // Start the simulation loop
    runSimulationLoop();
  };

  const runSimulationLoop = useCallback(async () => {
    while (isRunningRef.current) {
      const startTime = performance.now();

      const data = await sendWorkerMessage({
        type: "step",
        payload: { years: yearsPerStep },
      });

      if (!data) {
        console.error("Step failed");
        break;
      }

      setStepTime(performance.now() - startTime);
      setTotalPopulation(Math.round(data.total_population));

      const newState: YearState = {
        year: data.year,
        biomass: data.biomass,
        population: data.population,
      };

      setYearStates((prev) => [...prev, newState]);
      setCurrentYear(data.year);

      if (autoPlay) {
        setViewingYear(data.year);
      }

      // Small delay for UI responsiveness
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    setIsRunning(false);
  }, [autoPlay, yearsPerStep]);

  const stopSimulation = () => {
    isRunningRef.current = false;
    setIsRunning(false);
  };

  const resetSimulation = () => {
    isRunningRef.current = false;
    setIsRunning(false);
    setYearStates([]);
    setCurrentYear(0);
    setViewingYear(0);
    setStepTime(null);
    setSelectedVariable("populationOverlay");
    setStartLocation(null);
    setLocationError(null);
  };

  const handleCellClick = (row: number, col: number) => {
    if (yearStates.length === 0 && !isRunning) {
      setStartLocation({ row, col });
      setLocationError(null);
    }
  };

  // Build display state for the canvas
  const getDisplayState = (): SimulationState | null => {
    const yearData = yearStates[viewingYear];

    if (yearData) {
      const emptyGrid = yearData.biomass.map((row) => row.map(() => 0));
      return {
        year: yearData.year,
        biomass: {
          current: NumericGrid.fromArray(yearData.biomass, cellSizeKm),
          max: NumericGrid.fromArray(yearData.biomass, cellSizeKm),
          digestible: NumericGrid.fromArray(yearData.biomass, cellSizeKm),
          sustainableHarvest: NumericGrid.fromArray(yearData.biomass, cellSizeKm),
        },
        bison: {
          population: NumericGrid.fromArray(yearData.population, cellSizeKm),
          foodDemand: NumericGrid.fromArray(emptyGrid, cellSizeKm),
          foodSatisfaction: NumericGrid.fromArray(emptyGrid, cellSizeKm),
          carryingCapacity: NumericGrid.fromArray(emptyGrid, cellSizeKm),
        },
      };
    }

    if (initialBiomass) {
      const emptyGrid = initialBiomass.map((row) => row.map(() => 0));
      return {
        year: 0,
        biomass: {
          current: NumericGrid.fromArray(initialBiomass, cellSizeKm),
          max: NumericGrid.fromArray(initialBiomass, cellSizeKm),
          digestible: NumericGrid.fromArray(initialBiomass, cellSizeKm),
          sustainableHarvest: NumericGrid.fromArray(initialBiomass, cellSizeKm),
        },
        bison: {
          population: NumericGrid.fromArray(emptyGrid, cellSizeKm),
          foodDemand: NumericGrid.fromArray(emptyGrid, cellSizeKm),
          foodSatisfaction: NumericGrid.fromArray(emptyGrid, cellSizeKm),
          carryingCapacity: NumericGrid.fromArray(emptyGrid, cellSizeKm),
        },
      };
    }

    return null;
  };

  const displayState = getDisplayState();

  return (
    <div style={{ minHeight: "100vh", padding: "24px" }}>
      {/* Header */}
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#f1f5f9" }}>
              Bison Population Dynamics
            </h1>
            <p style={{ color: "#94a3b8", margin: "4px 0 0" }}>
              Alaska Landscape Simulation
            </p>
          </div>

          {/* Status */}
          <div className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px" }}>
            <span
              className={`status-dot ${pyodideStatus === "ready" ? "online" : pyodideStatus === "error" ? "offline" : "loading"}`}
            />
            <span style={{ color: "#94a3b8" }}>
              {pyodideStatus === "ready" && "Ready (In-Browser)"}
              {pyodideStatus === "error" && "Error Loading"}
              {pyodideStatus === "loading" && loadingMessage}
            </span>
            {gridInfo && (
              <span style={{ color: "#64748b", fontSize: "13px" }}>
                {gridInfo.width}×{gridInfo.height} grid
              </span>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
          {/* Map Section */}
          <div className="card">
            {/* Variable Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              <label style={{ color: "#94a3b8", fontSize: "14px" }}>Display:</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { id: "biomass", label: "Biomass" },
                  { id: "populationOverlay", label: "Population + Land" },
                  { id: "population", label: "Population Only" },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariable(v.id as any)}
                    className={`btn ${selectedVariable === v.id ? "btn-primary" : "btn-secondary"}`}
                    style={{ padding: "6px 14px", fontSize: "13px" }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ color: "#94a3b8", fontSize: "13px" }}>Zoom:</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 12px", fontSize: "14px" }}
                onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
              >
                −
              </button>
              <span style={{ color: "#f1f5f9", fontSize: "13px", minWidth: "50px", textAlign: "center" }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 12px", fontSize: "14px" }}
                onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))}
              >
                +
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 8px", fontSize: "12px" }}
                onClick={() => setZoomLevel(1)}
              >
                Reset
              </button>
            </div>

            {/* Canvas */}
            <div
              className="canvas-container"
              style={{
                display: "flex",
                justifyContent: "center",
                background: "#0f172a",
                borderRadius: "8px",
                padding: "16px",
                overflow: "auto",
                maxHeight: "600px",
              }}
            >
              {pyodideStatus === "loading" ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "400px", color: "#94a3b8" }}>
                  <div className="progress-bar" style={{ width: "200px", marginBottom: "16px" }}>
                    <div className="progress-bar-fill" style={{ width: "100%", animation: "pulse 1s infinite" }} />
                  </div>
                  <p>{loadingMessage}</p>
                  <p style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                    First load takes ~10 seconds to initialize Python in your browser
                  </p>
                </div>
              ) : (
                <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}>
                  <SimulationCanvas
                    state={displayState}
                    variable={selectedVariable}
                    visualizationService={container.visualizationService}
                    onCellClick={handleCellClick}
                    startMarker={yearStates.length === 0 ? startLocation : null}
                  />
                </div>
              )}
            </div>

            {/* Year Slider */}
            {yearStates.length > 1 && (
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "14px" }}>
                    Year: <strong style={{ color: "#f1f5f9" }}>{viewingYear}</strong>
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94a3b8", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={autoPlay}
                      onChange={(e) => setAutoPlay(e.target.checked)}
                    />
                    Auto-follow latest
                  </label>
                </div>
                <input
                  type="range"
                  min={0}
                  max={yearStates.length - 1}
                  value={viewingYear}
                  onChange={(e) => {
                    setViewingYear(parseInt(e.target.value));
                    setAutoPlay(false);
                  }}
                  style={{ width: "100%" }}
                />
              </div>
            )}
          </div>

          {/* Controls Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Simulation Controls */}
            <div className="card">
              <h3 style={{ margin: "0 0 16px", color: "#f1f5f9", fontSize: "16px" }}>
                Simulation Controls
              </h3>

              {/* Start Location Selection */}
              {yearStates.length === 0 && !isRunning && (
                <div style={{ marginBottom: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px" }}>
                  <div style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "8px" }}>
                    Starting Location:
                  </div>
                  {startLocation ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="status-dot online" style={{ marginRight: "0" }} />
                      <span style={{ color: "#22c55e", fontSize: "14px" }}>
                        Selected at ({startLocation.col}, {startLocation.row})
                      </span>
                    </div>
                  ) : (
                    <div style={{ color: "#eab308", fontSize: "13px" }}>
                      Click on the map to select where bison will start
                    </div>
                  )}
                  {locationError && (
                    <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px" }}>
                      {locationError}
                    </div>
                  )}
                </div>
              )}

              {/* Initial Population Size */}
              {yearStates.length === 0 && !isRunning && (
                <div style={{ marginBottom: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ color: "#94a3b8", fontSize: "13px" }}>Initial Population:</span>
                    <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: "bold" }}>{initialPopulation} bison</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={500}
                    step={10}
                    value={initialPopulation}
                    onChange={(e) => setInitialPopulation(parseInt(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                    <span>10</span>
                    <span>Realistic: 20-100</span>
                    <span>500</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {!isRunning && yearStates.length === 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={startSimulation}
                    disabled={pyodideStatus !== "ready" || !startLocation}
                    style={{ width: "100%", padding: "14px" }}
                  >
                    Start Simulation
                  </button>
                )}

                {isRunning && (
                  <button
                    className="btn btn-danger"
                    onClick={stopSimulation}
                    style={{ width: "100%", padding: "14px" }}
                  >
                    Stop Simulation
                  </button>
                )}

                {!isRunning && yearStates.length > 0 && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => { isRunningRef.current = true; setIsRunning(true); runSimulationLoop(); }}
                      disabled={pyodideStatus !== "ready"}
                      style={{ width: "100%", padding: "14px" }}
                    >
                      Continue Simulation
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={resetSimulation}
                      style={{ width: "100%", padding: "14px" }}
                    >
                      Reset
                    </button>
                  </>
                )}
              </div>

              {/* Years Per Step Control */}
              <div style={{ marginTop: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "13px" }}>Years per step:</span>
                  <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: "bold" }}>{yearsPerStep}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={yearsPerStep}
                  onChange={(e) => setYearsPerStep(parseInt(e.target.value))}
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              {/* Status */}
              {(isRunning || yearStates.length > 0) && (
                <div style={{ marginTop: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "13px" }}>
                    <span>Current Year</span>
                    <span style={{ color: "#f1f5f9", fontWeight: "bold" }}>{currentYear}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "13px", marginTop: "8px" }}>
                    <span>Total Population</span>
                    <span style={{ color: "#22c55e", fontWeight: "bold" }}>{totalPopulation.toLocaleString()}</span>
                  </div>
                  {stepTime && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: "13px", marginTop: "8px" }}>
                      <span>Step Time</span>
                      <span style={{ color: "#f1f5f9" }}>{stepTime.toFixed(0)}ms</span>
                    </div>
                  )}
                  {isRunning && (
                    <div style={{ marginTop: "12px" }}>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: "100%", animation: "pulse 1s infinite" }} />
                      </div>
                      <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: "12px", textAlign: "center" }}>
                        Simulating...
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Methodology Info Panel */}
            <div className="card">
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => setShowMethodology(!showMethodology)}
              >
                <h3 style={{ margin: 0, color: "#f1f5f9", fontSize: "16px" }}>
                  Methodology
                </h3>
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  {showMethodology ? "▼" : "▶"}
                </span>
              </div>

              {!showMethodology ? (
                <p style={{ margin: "12px 0 0", color: "#94a3b8", fontSize: "13px", lineHeight: "1.6" }}>
                  This simulation runs entirely in your browser using Python (via Pyodide/WebAssembly).
                  No server required - your data stays local.
                  {yearStates.length === 0 && (
                    <span style={{ display: "block", marginTop: "8px", color: "#64748b", fontStyle: "italic" }}>
                      Click on the map to select a starting location, then start the simulation.
                    </span>
                  )}
                </p>
              ) : (
                <div style={{ marginTop: "12px", color: "#94a3b8", fontSize: "12px", lineHeight: "1.7" }}>
                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "0 0 8px" }}>Browser-Based Simulation</h4>
                  <p style={{ margin: "0 0 12px" }}>
                    This app uses <strong>Pyodide</strong> to run Python directly in your browser via WebAssembly.
                    The simulation uses NumPy and SciPy for efficient array operations.
                  </p>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Data Sources</h4>
                  <p style={{ margin: "0 0 12px" }}>
                    Biomass data derived from satellite imagery of Alaska, processed with digestibility factors:
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li>Forbs: 80% digestibility</li>
                    <li>Graminoids: 50% digestibility</li>
                    <li>Deciduous shrubs: 30% digestibility</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Population Dynamics</h4>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Growth rate:</strong> 10% max, observed 5-7% (matches Yellowstone)</li>
                    <li><strong>Body mass:</strong> ~700 kg average</li>
                    <li><strong>Daily intake:</strong> 2% of body mass (~5.1 tonnes/year)</li>
                    <li><strong>Migration:</strong> FFT-based diffusion, 15% spread rate</li>
                    <li><strong>Allee effect:</strong> Sparse populations decline</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Model Validation</h4>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Observed λ (Yellowstone):</strong> 1.04-1.08 (4-8%/year)</li>
                    <li><strong>Simulated λ:</strong> 1.05-1.07 (5-7%/year)</li>
                  </ul>

                  <p style={{ margin: "16px 0 0", color: "#64748b", fontSize: "11px", fontStyle: "italic" }}>
                    Sources: Meagher (1986), Yellowstone NPS, Hobbs et al. (2015)
                  </p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="card">
              <h3 style={{ margin: "0 0 12px", color: "#f1f5f9", fontSize: "16px" }}>
                Color Scale
              </h3>
              {selectedVariable === "populationOverlay" ? (
                <>
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px" }}>Land (biomass)</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#64748b", fontSize: "11px" }}>Low</span>
                      <div style={{ flex: 1, height: "12px", borderRadius: "4px", background: "linear-gradient(90deg, #467838, #145014)" }} />
                      <span style={{ color: "#64748b", fontSize: "11px" }}>High</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px" }}>Water</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "40px", height: "12px", borderRadius: "2px", background: "#141e30" }} />
                      <span style={{ color: "#64748b", fontSize: "11px" }}>Ocean/Lakes</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "4px" }}>Population</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1, height: "12px", borderRadius: "4px", background: "linear-gradient(90deg, #8028b4, #d05078, #ff8040, #ffcc40)" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px", color: "#64748b", fontSize: "11px" }}>
                      <span>Few</span>
                      <span>Many</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, height: "12px", borderRadius: "4px", background: selectedVariable === "biomass" ? "linear-gradient(90deg, #f7fcf5, #00441b)" :
                      "linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
