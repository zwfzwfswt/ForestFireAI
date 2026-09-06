import json
import os

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SimulationBounds(BaseModel):
    model_config = ConfigDict(frozen=True, allow_inf_nan=False)
    west: float = Field(default=119.45, ge=-180, le=180)
    east: float = Field(default=119.95, ge=-180, le=180)
    south: float = Field(default=30.08, ge=-85, le=85)
    north: float = Field(default=30.42, ge=-85, le=85)

    @model_validator(mode="after")
    def ordered(self):
        if self.west >= self.east or self.south >= self.north:
            raise ValueError("simulation_bounds must be ordered west/east and south/north")
        return self


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, allow_inf_nan=False)
    # Seconds, WGS84 degrees and percentage points per second.
    telemetry_interval: float = Field(default=1.0, ge=0.01, le=60)
    simulation_bounds: SimulationBounds = Field(default_factory=SimulationBounds)
    battery_drain_rate: float = Field(default=0.005, ge=0, le=1)
    offline_timeout: float = Field(default=5.0, gt=0)
    send_timeout: float = Field(default=0.25, gt=0, le=5)
    close_timeout: float = Field(default=0.25, gt=0, le=5)
    max_step_seconds: float = Field(default=2.0, gt=0)
    turn_rate: float = Field(default=6.0, gt=0)
    boundary_margin: float = Field(default=0.015, gt=0)

    @classmethod
    def from_environment(cls):
        values = {}
        for field in cls.model_fields:
            raw = os.getenv(f"FORESTFIRE_{field.upper()}")
            if raw is not None:
                values[field] = json.loads(raw) if field == "simulation_bounds" else raw
        return cls.model_validate(values)
