import React from "react";
import { SimulationState } from "../../models/Simulation";
import { VisualizationService } from "../../services/VisualizationService";

interface StatisticsPanelProps {
  state: SimulationState | null;
  visualizationService: VisualizationService;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  state,
  visualizationService,
}) => {
  if (!state) {
    return <div className="statistics-panel">No simulation data</div>;
  }

  const stats = visualizationService.getStatistics(state);

  return (
    <div
      className="statistics-panel"
      style={{
        padding: "20px",
        backgroundColor: "#f5f5f5",
        borderRadius: "5px",
      }}
    >
      <h2>Statistics (Year {state.year})</h2>
      <div style={{ display: "grid", gap: "10px" }}>
        <div>
          <strong>Total Population:</strong> {stats.totalPopulation.toFixed(1)}{" "}
          bison
        </div>
        <div>
          <strong>Total Biomass:</strong> {stats.totalBiomass.toFixed(0)} kg/ha
        </div>
        <div>
          <strong>Avg Food Satisfaction:</strong>{" "}
          {(stats.averageFoodSatisfaction * 100).toFixed(1)}%
        </div>
        <div>
          <strong>Occupied Cells:</strong> {stats.occupiedCells}
        </div>
      </div>
    </div>
  );
};
