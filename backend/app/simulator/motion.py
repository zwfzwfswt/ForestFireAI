import math
from datetime import datetime

from app.core.config import Settings
from app.telemetry.models import TelemetryMessage


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def move(previous: TelemetryMessage, timestamp: datetime, config: Settings):
    dt = clamp((timestamp - previous.timestamp).total_seconds(), 0, config.max_step_seconds)
    epoch = timestamp.timestamp()
    bounds = config.simulation_bounds
    phase = sum(ord(char) for char in previous.uavId)
    turn = math.sin(epoch / 20 + phase) * 1.5
    margin = min(config.boundary_margin, (bounds.east - bounds.west) / 4,
                 (bounds.north - bounds.south) / 4)
    if (previous.longitude < bounds.west + margin or previous.longitude > bounds.east - margin
            or previous.latitude < bounds.south + margin or previous.latitude > bounds.north - margin):
        target = math.degrees(math.atan2(
            ((bounds.east + bounds.west) / 2 - previous.longitude) * math.cos(math.radians(previous.latitude)),
            (bounds.north + bounds.south) / 2 - previous.latitude,
        ))
        turn = clamp((target - previous.heading + 540) % 360 - 180, -config.turn_rate, config.turn_rate)
    heading = (previous.heading + turn * dt) % 360
    distance = previous.speed * dt
    latitude = previous.latitude + distance * math.cos(math.radians(heading)) / 111195
    longitude = previous.longitude + distance * math.sin(math.radians(heading)) / (111195 * math.cos(math.radians(previous.latitude)))
    if longitude < bounds.west or longitude > bounds.east:
        heading = (360 - heading) % 360
    if latitude < bounds.south or latitude > bounds.north:
        heading = (180 - heading) % 360
    battery = max(0, previous.battery - config.battery_drain_rate * dt)
    return TelemetryMessage(**{
        **previous.model_dump(), "timestamp": timestamp,
        "longitude": clamp(longitude, bounds.west, bounds.east),
        "latitude": clamp(latitude, bounds.south, bounds.north),
        "heading": heading, "battery": battery,
        "altitude": clamp(previous.altitude + math.sin(epoch / 15 + phase) * 0.2 * dt, 20, 200),
        "signal": clamp(previous.signal + math.sin(epoch / 10 + phase) * 0.1 * dt, 0, 100),
        "status": "warning" if battery < 10 else "online",
    })
