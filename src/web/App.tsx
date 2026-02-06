import React, { useState, useEffect, useRef, useCallback } from "react";
import { container } from "../di/Container";
import { SimulationState } from "../models/Simulation";
import { NumericGrid } from "../models/Grid";
import { SimulationCanvas } from "./components/SimulationCanvas";

// Use environment variable for API URL, fallback to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

interface GridInfo {
  width: number;
  height: number;
  cellSizeKm: number;
  totalCells: number;
}

interface YearState {
  year: number;
  biomass: number[][];
  population: number[][];
  foodSatisfaction: number[][];
  carryingCapacity: number[][];
}

export const App: React.FC = () => {
  // Server state
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking");
  const [gridInfo, setGridInfo] = useState<GridInfo | null>(null);

  // Simulation state
  const [isRunning, setIsRunning] = useState(false);
  const [currentYear, setCurrentYear] = useState(0);
  const [yearStates, setYearStates] = useState<YearState[]>([]);
  const [viewingYear, setViewingYear] = useState(0);
  const [stepTime, setStepTime] = useState<number | null>(null);
  const [cellSizeKm, setCellSizeKm] = useState(1);

  // Initial biomass
  const [initialBiomass, setInitialBiomass] = useState<number[][] | null>(null);

  // Display settings
  const [selectedVariable, setSelectedVariable] = useState<
    "biomass" | "population" | "carryingCapacity" | "foodSatisfaction" | "populationOverlay"
  >("populationOverlay");  // Default to overlay view
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

  // Check server status
  useEffect(() => {
    checkServerStatus();
  }, []);

  const checkServerStatus = async () => {
    setServerStatus("checking");
    try {
      const [healthRes, gridRes] = await Promise.all([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/grid-info`),
      ]);

      if (healthRes.ok && gridRes.ok) {
        const info = await gridRes.json();
        setGridInfo(info);
        setServerStatus("online");
        loadInitialBiomass();
      } else {
        setServerStatus("offline");
      }
    } catch {
      setServerStatus("offline");
    }
  };

  const loadInitialBiomass = async () => {
    try {
      const response = await fetch(`${API_BASE}/initial-biomass`);
      if (response.ok) {
        const data = await response.json();
        setInitialBiomass(data.biomass);
        setCellSizeKm(data.metadata.cellSizeKm);
      }
    } catch (error) {
      console.error("Failed to load initial biomass:", error);
    }
  };

  const startSimulation = async () => {
    if (!startLocation) {
      setLocationError("Please click on the map to select a starting location");
      return;
    }

    try {
      setIsRunning(true);
      isRunningRef.current = true;
      setYearStates([]);
      setCurrentYear(0);
      setViewingYear(0);
      setLocationError(null);

      // Start new simulation session with selected start location
      const response = await fetch(`${API_BASE}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            initialization: {
              totalPopulation: initialPopulation,
            },
          },
          startCoordinates: startLocation,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setLocationError(error.message || "Failed to start simulation");
        setIsRunning(false);
        isRunningRef.current = false;
        return;
      }

      const data = await response.json();
      setCellSizeKm(data.metadata.cellSizeKm);

      const initialState: YearState = {
        year: 0,
        biomass: data.state.biomass,
        population: data.state.population,
        foodSatisfaction: data.state.foodSatisfaction,
        carryingCapacity: data.state.carryingCapacity,
      };

      setYearStates([initialState]);
      setSelectedVariable("populationOverlay");

      // Start the simulation loop
      runSimulationLoop();
    } catch (error) {
      console.error("Failed to start simulation:", error);
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const runSimulationLoop = useCallback(async () => {
    while (isRunningRef.current) {
      try {
        const response = await fetch(`${API_BASE}/step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ years: yearsPerStep }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("Step failed:", error);
          break;
        }

        const data = await response.json();
        setStepTime(data.stepTimeMs);

        const newState: YearState = {
          year: data.year,
          biomass: data.state.biomass,
          population: data.state.population,
          foodSatisfaction: data.state.foodSatisfaction,
          carryingCapacity: data.state.carryingCapacity,
        };

        // Calculate total population from the grid
        const popSum = data.state.population.reduce(
          (sum: number, row: number[]) => sum + row.reduce((s: number, v: number) => s + v, 0),
          0
        );
        setTotalPopulation(Math.round(popSum));

        setYearStates((prev) => {
          const newStates = [...prev, newState];
          if (autoPlay) {
            setViewingYear(newStates.length - 1);
          }
          return newStates;
        });
        setCurrentYear(data.year);

        // Small delay to prevent overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        console.error("Simulation loop error:", error);
        break;
      }
    }

    setIsRunning(false);
  }, [autoPlay, yearsPerStep]);

  const stopSimulation = async () => {
    isRunningRef.current = false;
    setIsRunning(false);

    try {
      await fetch(`${API_BASE}/stop`, { method: "POST" });
    } catch (error) {
      console.error("Failed to stop simulation:", error);
    }
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
    // Only allow selecting start location before simulation starts
    if (yearStates.length === 0 && !isRunning) {
      setStartLocation({ row, col });
      setLocationError(null);
    }
  };

  // Build display state for the canvas
  const getDisplayState = (): SimulationState | null => {
    const yearData = yearStates[viewingYear];

    if (yearData) {
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
          foodDemand: NumericGrid.fromArray(yearData.population, cellSizeKm),
          foodSatisfaction: NumericGrid.fromArray(yearData.foodSatisfaction, cellSizeKm),
          carryingCapacity: NumericGrid.fromArray(yearData.carryingCapacity, cellSizeKm),
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

          {/* Server Status */}
          <div className="card" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px" }}>
            <span
              className={`status-dot ${serverStatus === "online" ? "online" : serverStatus === "offline" ? "offline" : "loading"}`}
            />
            <span style={{ color: "#94a3b8" }}>
              {serverStatus === "online" && "Server Online"}
              {serverStatus === "offline" && "Server Offline"}
              {serverStatus === "checking" && "Connecting..."}
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
                  { id: "carryingCapacity", label: "Carrying Capacity" },
                  { id: "foodSatisfaction", label: "Food Satisfaction" },
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
              <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: "top center" }}>
                <SimulationCanvas
                  state={displayState}
                  variable={selectedVariable}
                  visualizationService={container.visualizationService}
                  onCellClick={handleCellClick}
                  startMarker={yearStates.length === 0 ? startLocation : null}
                />
              </div>
            </div>

            {/* Year Slider */}
            {yearStates.length > 1 && (
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "14px" }}>
                    Year: <strong style={{ color: "#f1f5f9" }}>{yearStates[viewingYear]?.year ?? 0}</strong>
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
                    <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: "bold" }}>{initialPopulation.toLocaleString()} bison</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={20000}
                    step={initialPopulation < 500 ? 10 : 500}
                    value={initialPopulation}
                    onChange={(e) => setInitialPopulation(parseInt(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", color: "#64748b", fontSize: "11px" }}>
                    <span>10</span>
                    <span>Small release: 20-100 | Large: 5k-20k</span>
                    <span>20k</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {!isRunning && yearStates.length === 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={startSimulation}
                    disabled={serverStatus !== "online" || !startLocation}
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
                      onClick={startSimulation}
                      disabled={serverStatus !== "online"}
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
              <div style={{ marginBottom: "16px", padding: "12px", background: "#0f172a", borderRadius: "8px" }}>
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
                      <span style={{ color: "#f1f5f9" }}>{(stepTime / 1000).toFixed(2)}s</span>
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
                  This simulation models bison population dynamics using satellite-derived
                  biomass data and scientifically-based ecological parameters.
                  {yearStates.length === 0 && (
                    <span style={{ display: "block", marginTop: "8px", color: "#64748b", fontStyle: "italic" }}>
                      Click on the map to select a starting location, then start the simulation.
                    </span>
                  )}
                </p>
              ) : (
                <div style={{ marginTop: "12px", color: "#94a3b8", fontSize: "12px", lineHeight: "1.7" }}>
                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "0 0 8px" }}>Data Sources</h4>
                  <p style={{ margin: "0 0 12px" }}>
                    Biomass data derived from 2020 satellite imagery survey of Alaska, processed with plant-type-specific
                    digestibility factors based on Poquérusse et al. (2024):
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li>Forbs: 80% digestibility</li>
                    <li>Graminoids: 50% digestibility</li>
                    <li>Deciduous shrubs: 30% digestibility</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Initial Population</h4>
                  <p style={{ margin: "0 0 8px" }}>
                    Simulates a realistic reintroduction scenario:
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Founding population:</strong> Configurable 10-20,000 bison</li>
                    <li><strong>Release area:</strong> Automatically scaled based on population size and local habitat quality</li>
                    <li><strong>Distribution:</strong> Weighted by both distance from center and local biomass quality</li>
                    <li><strong>Adaptive placement:</strong> Bison preferentially placed in higher-quality habitat cells</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Bison Parameters</h4>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Body mass:</strong> ~700 kg average (males ~900kg, females ~500kg)</li>
                    <li><strong>Daily intake:</strong> 2% of body mass (~14 kg dry matter/day, ~5.1 tonnes/year)</li>
                    <li><strong>Maximum growth rate:</strong> 20% per year under optimal conditions (matches Yukon reintroduction data)</li>
                    <li><strong>Observed growth:</strong> 10-20% in open habitat, 5-7% in saturated habitat (Yellowstone-level)</li>
                    <li><strong>Starvation threshold:</strong> Population declines when food satisfaction &lt;20%</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Population Dynamics</h4>
                  <p style={{ margin: "0 0 8px" }}>
                    The model uses a modified logistic growth equation calibrated to Yellowstone bison data:
                  </p>
                  <div style={{ background: "#0f172a", padding: "8px 12px", borderRadius: "4px", fontFamily: "monospace", marginBottom: "12px" }}>
                    dN/dt = rN(1 - N/K) × f(food)
                  </div>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Growth rate (r):</strong> 20% max, calibrated to Yukon reintroduction (~20%) and Yellowstone (4-8% at capacity)</li>
                    <li><strong>Carrying capacity (K):</strong> Based on sustainable harvest of digestible biomass</li>
                    <li><strong>Allee effect:</strong> Sparse populations (&lt;0.05/cell) decline due to mate-finding difficulty</li>
                    <li><strong>Density dependence:</strong> Growth slows as population approaches carrying capacity</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Migration</h4>
                  <p style={{ margin: "0 0 8px" }}>
                    Bison migrate using FFT-based diffusion with habitat preference:
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Annual range:</strong> ~200 km seasonal migration distance (bison cover 100-300km seasonally)</li>
                    <li><strong>Diffusion rate:</strong> 35% of frontier population spreads to adjacent cells per year</li>
                    <li><strong>Habitat preference:</strong> Biased movement toward higher carrying capacity</li>
                    <li><strong>Barriers:</strong> Water (biomass = 0) blocks movement</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Carrying Capacity</h4>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Utilization factor:</strong> 50% of digestible biomass sustainably harvestable</li>
                    <li><strong>Biomass regrowth:</strong> 40% of deficit recovers per year</li>
                    <li><strong>Per-cell capacity:</strong> Varies by habitat (0.1-2+ bison/km²)</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Model Validation</h4>
                  <p style={{ margin: "0 0 8px" }}>
                    Growth rates calibrated against multiple bison population studies:
                  </p>
                  <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }}>
                    <li><strong>Yukon reintroduction:</strong> ~20%/year growth in good open habitat</li>
                    <li><strong>Yellowstone (at capacity):</strong> λ 1.04-1.08 (4-8% annual growth)</li>
                    <li><strong>Simulated λ:</strong> Up to 1.20 in open habitat, settling to 1.05-1.07 near capacity</li>
                    <li><strong>Adult survival:</strong> ~92% per year (implicit in growth rate)</li>
                  </ul>

                  <h4 style={{ color: "#f1f5f9", fontSize: "14px", margin: "16px 0 8px" }}>Limitations</h4>
                  <ul style={{ margin: "0", paddingLeft: "20px" }}>
                    <li>No predation or disease mortality modeled</li>
                    <li>Seasonal variation not included (annual timestep)</li>
                    <li>No age/sex structure in population</li>
                    <li>Climate variation not modeled</li>
                  </ul>

                  <p style={{ margin: "16px 0 0", color: "#64748b", fontSize: "11px", fontStyle: "italic" }}>
                    Sources: Meagher (1986), Plumb & Dodd (1993), Yellowstone NPS Bison Ecology,
                    Hobbs et al. (2015) Population Demography of Yellowstone Bison,
                    Yukon Wood Bison Recovery Program
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
                      selectedVariable === "population" ? "linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)" :
                      selectedVariable === "carryingCapacity" ? "linear-gradient(90deg, #ffffe5, #662506)" :
                      "linear-gradient(90deg, #a50026, #f46d43, #fee08b, #66bd63, #006837)" }} />
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
