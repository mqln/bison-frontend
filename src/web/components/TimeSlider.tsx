import React from "react";

interface TimeSliderProps {
  currentYear: number;
  totalYears: number;
  onChange: (year: number) => void;
  isRunning: boolean;
}

export const TimeSlider: React.FC<TimeSliderProps> = ({
  currentYear,
  totalYears,
  onChange,
  isRunning,
}) => {
  return (
    <div
      className="time-slider"
      style={{ padding: "20px", backgroundColor: "#f5f5f5" }}
    >
      <h3>Year: {currentYear}</h3>
      <input
        type="range"
        min={0}
        max={Math.max(0, totalYears - 1)}
        value={currentYear}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={isRunning}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>0</span>
        <span>{totalYears - 1}</span>
      </div>
    </div>
  );
};
