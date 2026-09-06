import asyncio
from datetime import datetime, timezone

from app.core.config import Settings
from app.simulator.motion import clamp, move
from app.telemetry.models import TelemetryMessage
from app.telemetry.bus import TelemetryHandler

# Deliberate ID contract with frontend Mock assets; no asset CRUD backend in V1.
MOCK_SEEDS = (
    (1, 119.52, 30.13, 80, 4, 0, 92, 96),
    (3, 119.72, 30.13, 120, 8, 80, 76, 89),
    (6, 119.62, 30.32, 60, 3, 200, 18, 28),
    (7, 119.72, 30.32, 90, 5, 240, 88, 92),
    (8, 119.82, 30.32, 110, 7, 280, 67, 86),
)


class UavSimulator:
    def __init__(self, config: Settings, count: int = 5):
        if not 1 <= count <= 5:
            raise ValueError("Simulator count must be 1..5")
        self.count = count
        self.config = config
        self.latest: dict[str, TelemetryMessage] = {}

    def tick(self, timestamp: datetime) -> list[TelemetryMessage]:
        if not self.latest:
            bounds = self.config.simulation_bounds
            for number, lng, lat, altitude, speed, heading, battery, signal in MOCK_SEEDS[:self.count]:
                packet = TelemetryMessage(
                    uavId=f"mock-uav-{number}", timestamp=timestamp,
                    longitude=clamp(lng, bounds.west, bounds.east),
                    latitude=clamp(lat, bounds.south, bounds.north), altitude=altitude,
                    speed=speed, heading=heading, battery=battery, signal=signal, status="online",
                )
                self.latest[packet.uavId] = packet
        else:
            self.latest = {key: move(packet, timestamp, self.config) for key, packet in self.latest.items()}
        return list(self.latest.values())

    async def run(self, publish: TelemetryHandler):
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        while True:
            for packet in self.tick(datetime.now(timezone.utc)):
                await publish(packet)
            deadline += self.config.telemetry_interval
            # Do not accumulate catch-up tasks after a stalled event loop.
            if deadline < loop.time():
                deadline = loop.time() + self.config.telemetry_interval
            await asyncio.sleep(max(0, deadline - loop.time()))
