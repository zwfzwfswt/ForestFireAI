import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import Settings
from app.simulator.fleet import UavSimulator
from app.telemetry.bus import TelemetryBus
from app.mqtt.consumer import MqttConsumer
from app.mavsdk.telemetry_source import MavsdkTelemetrySource
from app.websocket.manager import ConnectionManager


def create_app(settings: Settings | None = None):
    config = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logging.basicConfig(level=logging.INFO)
        manager = ConnectionManager(config.send_timeout, config.close_timeout)
        simulator = UavSimulator(config)
        bus = TelemetryBus()
        bus.subscribe(manager.handle_telemetry)
        consumer = MqttConsumer(config, bus) if config.telemetry_input_mode == "mqtt" else None
        mavsdk = MavsdkTelemetrySource(config, bus) if config.telemetry_input_mode == "mavsdk" else None
        app.state.connections = manager
        app.state.simulator = simulator
        app.state.telemetry_bus = bus
        app.state.mqtt = consumer
        app.state.mavsdk = mavsdk
        app.state.config = config
        task = None
        try:
            if consumer is not None:
                await consumer.start()
            if mavsdk is not None:
                await mavsdk.start()
            elif config.simulator_enabled:
                task = asyncio.create_task(simulator.run(consumer.publish if consumer else bus.publish),
                                           name="uav-mock-simulator")
            app.state.simulator_task = task
            yield
        finally:
            try:
                if task is not None:
                    task.cancel()
                    with suppress(asyncio.CancelledError):
                        await task
            finally:
                try:
                    if consumer is not None:
                        await consumer.stop()
                finally:
                    try:
                        if mavsdk is not None:
                            await mavsdk.stop()
                    finally:
                        bus.unsubscribe(manager.handle_telemetry)
                        await manager.close_all()

    app = FastAPI(title="ForestFireAI Backend · DEV / MOCK", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()
