"""Opt-in read-only test against an already-running PX4 SITL. No flight actions."""
import asyncio
import os

import pytest

from app.core.config import Settings
from app.main import create_app
from test_backend import FakeClient


@pytest.mark.skipif(os.getenv("FORESTFIRE_SITL_TEST") != "1", reason="PX4 SITL not requested/available")
def test_existing_sitl_to_bus_and_websocket():
    async def scenario():
        config = Settings.from_environment()
        config = Settings.model_validate({**config.model_dump(), "telemetry_input_mode": "mavsdk"})
        app = create_app(config)
        async with app.router.lifespan_context(app):
            receiver = FakeClient()
            await app.state.connections.connect(receiver)
            async with asyncio.timeout(config.mavsdk_connect_timeout * 2 + 15):
                while len(receiver.received) < 2:
                    await asyncio.sleep(0.1)
            assert app.state.mavsdk.status == "connected"
            assert receiver.received[-1]["uavId"] == config.mavsdk_uav_id
            assert receiver.received[-1]["signal"] is None
            assert receiver.received[-1]["timestamp"] > receiver.received[0]["timestamp"]
    asyncio.run(scenario())
