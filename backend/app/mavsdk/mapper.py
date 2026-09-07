"""Latest-field aggregation; freshness is tracked separately for every stream."""
import logging
import math
from datetime import datetime

from pydantic import ValidationError
from app.telemetry.models import TelemetryMessage

logger = logging.getLogger(__name__)
STREAMS = ("position", "velocity", "heading", "battery")


class TelemetryAggregator:
    def __init__(self, uav_id: str, field_timeout: float):
        self.uav_id = uav_id
        self.field_timeout = field_timeout
        self.values = {}
        self.last_position = None

    def update(self, stream: str, value, monotonic: float, timestamp: datetime):
        self.values[stream] = (value, monotonic, timestamp)

    def snapshot(self, monotonic: float) -> TelemetryMessage | None:
        if any(name not in self.values for name in STREAMS):
            return None
        if any(not 0 <= monotonic - self.values[name][1] <= self.field_timeout for name in STREAMS):
            return None
        position, position_time, timestamp = self.values["position"]
        if position_time == self.last_position:
            return None  # Never refresh stale coordinates with a new timestamp.
        self.last_position = position_time
        velocity = self.values["velocity"][0]
        try:
            remaining = self.values["battery"][0].remaining_percent
            heading = self.values["heading"][0].heading_deg
            # MAVSDK-Python 3.17.2 documents remaining_percent as 0..100.
            if not math.isfinite(remaining) or not 0 <= remaining <= 100:
                raise ValueError("battery percentage outside [0,100]")
            if not math.isfinite(heading) or not 0 <= heading <= 360:
                raise ValueError("heading outside [0,360]")
            if timestamp.tzinfo is None or timestamp.timestamp() < 0:
                raise ValueError("invalid timestamp")
            return TelemetryMessage(
                uavId=self.uav_id, timestamp=timestamp,
                longitude=position.longitude_deg, latitude=position.latitude_deg,
                altitude=position.relative_altitude_m,
                speed=math.hypot(velocity.north_m_s, velocity.east_m_s),
                heading=heading % 360, battery=remaining,
                signal=None, status="online",
            )
        except (AttributeError, TypeError, ValueError, ValidationError, OverflowError):
            logger.warning("Invalid MAVSDK telemetry frame; skipped")
            return None
