// DEV / MOCK only. WGS84 degrees, metres, seconds and percentage points.
export const simulatorConfig = {
  telemetryInterval: 1000,
  offlineTimeout: 5000,
  maxTrackPoints: 300,
  simulationBounds: { west: 119.45, east: 119.95, south: 30.08, north: 30.42 },
  batteryDrainRate: 0.005,
  maxStepSeconds: 2,
  turnRate: 6,
  boundaryMargin: 0.015,
} as const;
