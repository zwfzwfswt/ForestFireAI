import json
import os
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator


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
    telemetry_input_mode: Literal["direct", "mqtt", "mavsdk"] = "direct"
    mavsdk_system_address: str = "udpin://0.0.0.0:14540"
    mavsdk_uav_id: str = Field(default="mock-uav-1", min_length=1, max_length=80)
    mavsdk_connect_timeout: float = Field(default=10, gt=0, le=120)
    mavsdk_reconnect_interval: float = Field(default=3, gt=0, le=120)
    mavsdk_telemetry_interval: float = Field(default=1, ge=0.05, le=60)
    mavsdk_field_timeout: float = Field(default=5, gt=0, le=120)

    @field_validator("mavsdk_system_address")
    @classmethod
    def valid_mavsdk_address(cls, value):
        from urllib.parse import urlsplit
        address = urlsplit(value)
        if (address.scheme not in {"udpin", "udpout", "tcpin", "tcpout"}
                or not address.hostname or not address.port or address.path
                or address.query or address.fragment or address.username or address.password):
            raise ValueError("Use an explicit MAVSDK udpin/udpout/tcpin/tcpout host:port URL")
        return value
    mqtt_host: str = Field(default="127.0.0.1", min_length=1)
    mqtt_port: int = Field(default=1883, ge=1, le=65535)
    mqtt_username: str = ""
    mqtt_password: SecretStr = SecretStr("")
    mqtt_topic_prefix: str = "forestfire/uav"
    mqtt_keepalive: int = Field(default=10, ge=5, le=120)
    mqtt_reconnect_max: int = Field(default=30, ge=1, le=120)
    mqtt_queue_size: int = Field(default=256, ge=1, le=10000)
    mqtt_max_payload_bytes: int = Field(default=16384, ge=256, le=65536)
    mqtt_poll_interval: float = Field(default=0.02, gt=0, le=1)
    simulator_enabled: bool = True

    @field_validator("mqtt_topic_prefix")
    @classmethod
    def valid_topic_prefix(cls, value):
        if not value or any(c in value for c in "+#\x00") or any(not part for part in value.split("/")):
            raise ValueError("MQTT_TOPIC_PREFIX must contain nonempty topic levels without wildcards")
        return value

    @classmethod
    def from_environment(cls):
        values = {}
        for field in cls.model_fields:
            key = field.upper() if field.startswith(("mqtt_", "mavsdk_")) or field == "telemetry_input_mode" else f"FORESTFIRE_{field.upper()}"
            raw = os.getenv(key)
            if raw is not None:
                values[field] = json.loads(raw) if field == "simulation_bounds" else raw
        return cls.model_validate(values)
