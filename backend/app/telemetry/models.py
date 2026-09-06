from datetime import datetime, timezone
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class TelemetryMessage(BaseModel):
    """One UAV sample. WGS84, relative-home metres, m/s, degrees, percent."""

    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)
    type: Literal["telemetry"] = "telemetry"
    uavId: str = Field(min_length=1, max_length=80)
    timestamp: AwareDatetime
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    altitude: float
    speed: float = Field(ge=0)
    heading: float = Field(ge=0, lt=360)
    battery: float = Field(ge=0, le=100)
    signal: float = Field(ge=0, le=100)
    status: Literal["online", "offline", "mission", "charging", "maintenance", "warning"]

    @field_validator("timestamp")
    @classmethod
    def utc_timestamp(cls, value: datetime):
        return value.astimezone(timezone.utc)
