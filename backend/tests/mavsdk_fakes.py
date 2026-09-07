"""TEST ONLY. Async SDK-shaped streams, not a PX4/SITL implementation."""
import asyncio
import math
from types import SimpleNamespace as Value


class FakeMavsdkClient:
    def __init__(self):
        self.disconnect = asyncio.Event()
        self.closed = False
        self.active_streams = set()
        self.address = None
        self.connect_delay = 0
        self.initial_connected = True
        self.freeze_position = False

    async def connect(self, address):
        self.address = address
        await asyncio.sleep(self.connect_delay)

    async def close(self):
        self.closed = True

    async def connection_state(self):
        self.active_streams.add("connection")
        try:
            yield Value(is_connected=self.initial_connected)
            await self.disconnect.wait()
            yield Value(is_connected=False)
        finally:
            self.active_streams.remove("connection")

    async def _stream(self, name, value, period):
        self.active_streams.add(name)
        index = 0
        try:
            while True:
                if name != "position" or not self.freeze_position:
                    yield value(index)
                    index += 1
                await asyncio.sleep(period)
        finally:
            self.active_streams.remove(name)

    def position(self):
        return self._stream("position", lambda i: Value(longitude_deg=119.52 + math.sin(i / 1000) * 0.01,
            latitude_deg=30.13, relative_altitude_m=80 + i * 0.001, absolute_altitude_m=580), 0.05)

    def velocity(self):
        return self._stream("velocity", lambda i: Value(north_m_s=3, east_m_s=4, down_m_s=12), 0.07)

    def heading(self):
        return self._stream("heading", lambda i: Value(heading_deg=i % 360), 0.09)

    def battery(self):
        return self._stream("battery", lambda i: Value(remaining_percent=85 - min(i, 1000) * 0.01), 0.13)
