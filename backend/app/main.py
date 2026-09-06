import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI

from app.api.routes import router
from app.core.config import Settings
from app.simulator.fleet import UavSimulator
from app.websocket.manager import ConnectionManager


def create_app(settings: Settings | None = None):
    config = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        manager = ConnectionManager(config.send_timeout, config.close_timeout)
        simulator = UavSimulator(config)
        app.state.connections = manager
        app.state.simulator = simulator
        task = asyncio.create_task(simulator.run(manager), name="uav-mock-simulator")
        app.state.simulator_task = task
        try:
            yield
        finally:
            task.cancel()
            try:
                with suppress(asyncio.CancelledError):
                    await task
            finally:
                await manager.close_all()

    app = FastAPI(title="ForestFireAI Backend · DEV / MOCK", lifespan=lifespan)
    app.include_router(router)
    return app


app = create_app()
