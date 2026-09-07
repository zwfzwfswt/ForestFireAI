import asyncio
import logging
from contextlib import aclosing, suppress
from datetime import datetime, timezone

from app.core.config import Settings
from app.telemetry.bus import TelemetryBus
from app.mavsdk.client import ReadOnlyMavsdkClient
from app.mavsdk.mapper import STREAMS, TelemetryAggregator

logger = logging.getLogger(__name__)


class MavsdkTelemetrySource:
    def __init__(self, config: Settings, bus: TelemetryBus, client_factory=None):
        self.config = config
        self.bus = bus
        self.client_factory = client_factory or ReadOnlyMavsdkClient
        self.status = "disconnected"
        self._task = None

    async def start(self):
        if self._task is None:
            self.status = "connecting"
            self._task = asyncio.create_task(self._run(), name="mavsdk-source")

    async def stop(self):
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        self.status = "disconnected"

    async def _session(self, client):
        ready = asyncio.Event()
        aggregator = TelemetryAggregator(self.config.mavsdk_uav_id, self.config.mavsdk_field_timeout)
        loop = asyncio.get_running_loop()

        async def connection():
            async with aclosing(client.connection_state()) as stream:
                async for state in stream:
                    if state.is_connected:
                        self.status = "connected"
                        ready.set()
                    elif ready.is_set():
                        self.status = "disconnected"
                        raise ConnectionError("MAVSDK disconnected")
            raise ConnectionError("MAVSDK connection stream ended")

        async def collect(name):
            async with aclosing(getattr(client, name)()) as stream:
                async for value in stream:
                    aggregator.update(name, value, loop.time(), datetime.now(timezone.utc))
            raise ConnectionError(f"MAVSDK {name} stream ended")

        async def emit():
            while True:
                await asyncio.sleep(self.config.mavsdk_telemetry_interval)
                packet = aggregator.snapshot(loop.time())
                if packet is not None:
                    await self.bus.publish(packet)

        tasks = []
        try:
            await asyncio.wait_for(client.connect(self.config.mavsdk_system_address), self.config.mavsdk_connect_timeout)
            monitor = asyncio.create_task(connection(), name="mavsdk-connection")
            tasks.append(monitor)
            waiter = asyncio.create_task(ready.wait(), name="mavsdk-ready")
            tasks.append(waiter)
            done, _ = await asyncio.wait([monitor, waiter], timeout=self.config.mavsdk_connect_timeout,
                                         return_when=asyncio.FIRST_COMPLETED)
            if monitor in done:
                await monitor
            if not ready.is_set():
                raise TimeoutError("MAVSDK connection timeout")
            tasks.extend(asyncio.create_task(collect(name), name=f"mavsdk-{name}") for name in STREAMS)
            tasks.append(asyncio.create_task(emit(), name="mavsdk-aggregate"))
            await asyncio.gather(monitor, *tasks[2:])
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            try:
                await client.close()
            except Exception:
                logger.exception("MAVSDK client cleanup failed")

    async def _run(self):
        first = True
        while True:
            self.status = "connecting" if first else "reconnecting"
            first = False
            try:
                await self._session(self.client_factory())
            except (ConnectionError, TimeoutError) as error:
                self.status = "disconnected"
                logger.warning("MAVSDK disconnected: %s", error)
            except Exception:
                self.status = "error"
                logger.exception("MAVSDK telemetry source error")
            await asyncio.sleep(self.config.mavsdk_reconnect_interval)
