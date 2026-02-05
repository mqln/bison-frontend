import React, { useRef, useEffect, useState } from "react";
import { SimulationState } from "../../models/Simulation";
import { VisualizationService, DisplayVariable } from "../../services/VisualizationService";

interface SimulationCanvasProps {
  state: SimulationState | null;
  variable: DisplayVariable;
  visualizationService: VisualizationService;
  onCellClick?: (row: number, col: number) => void;
  startMarker?: { row: number; col: number } | null;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  state,
  variable,
  visualizationService,
  onCellClick,
  startMarker,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);

  // Track container size for responsive canvas
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!state || !canvasRef.current) return;

    // Render to canvas
    visualizationService.renderToCanvas(canvasRef.current, state, variable);

    // Draw start marker if present
    if (startMarker) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const cellWidth = canvas.width / state.biomass.current.width;
        const cellHeight = canvas.height / state.biomass.current.height;
        const x = startMarker.col * cellWidth + cellWidth / 2;
        const y = startMarker.row * cellHeight + cellHeight / 2;
        const radius = Math.max(3, Math.min(cellWidth, cellHeight) * 1.5);

        // Draw outer ring
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw inner ring
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw center dot
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }
    }
  }, [state, variable, visualizationService, startMarker]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick || !canvasRef.current || !state) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to grid coordinates
    const col = Math.floor((x / rect.width) * state.biomass.current.width);
    const row = Math.floor((y / rect.height) * state.biomass.current.height);

    onCellClick(row, col);
  };

  // Calculate canvas display size to fit container while maintaining aspect ratio
  const gridWidth = state?.biomass.current.width || 400;
  const gridHeight = state?.biomass.current.height || 400;
  const aspectRatio = gridWidth / gridHeight;
  const displayWidth = Math.min(containerWidth - 20, 600); // Max 600px, leave some padding
  const displayHeight = displayWidth / aspectRatio;

  return (
    <div
      ref={containerRef}
      className="simulation-canvas-container"
      style={{ width: "100%" }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          border: "1px solid #ccc",
          imageRendering: "pixelated",
          cursor: onCellClick ? "crosshair" : "default",
        }}
      />
    </div>
  );
};
