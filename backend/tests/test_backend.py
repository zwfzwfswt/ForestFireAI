import asyncio
import math
import unittest
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, SimulationBounds
from app.main import create_app
from app.simulator.fleet import UavSimulator
from app.simulator.motion import move
from app.telemetry.models import TelemetryMessage
from app.websocket.manager import ConnectionManager


def test_health_and_lifespan_cleanup():
    app = create_app(Settings(telemetry_interval=0.02))
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json() == {
            "status": "ok", "service": "ForestFireAI Backend",
        }
        assert not app.state.simulator_task.done()
    assert app.state.simulator_task.done()
    assert not app.state.connections.clients


def test_two_clients_share_fleet_and_disconnect_is_isolated():
    app = create_app(Settings(telemetry_interval=0.02))
    with TestClient(app) as client:
        with client.websocket_connect("/ws/telemetry") as first:
            with client.websocket_connect("/ws/telemetry") as second:
                assert len(app.state.connections.clients) == 2
                first_packets = [first.receive_json() for _ in range(5)]
                second_packets = [second.receive_json() for _ in range(5)]
                expected = {"mock-uav-1", "mock-uav-3", "mock-uav-6", "mock-uav-7", "mock-uav-8"}
                assert {packet["uavId"] for packet in first_packets} == expected
                assert {packet["uavId"] for packet in second_packets} == expected
                for packet in second_packets:
                    assert TelemetryMessage.model_validate(packet).type == "telemetry"
                    assert packet["timestamp"].endswith("Z")
                first.send_text("ignored: no control protocol")
            # Drain beyond any already queued frame; remaining client still receives new ticks.
            later = [first.receive_json() for _ in range(15)]
            assert later[-1]["timestamp"] > first_packets[-1]["timestamp"]
            assert not app.state.simulator_task.done()
        # TestClient context waits for the endpoint's finally cleanup.
        assert len(app.state.connections.clients) == 0


def test_continuous_five_uav_motion_for_ten_minutes():
    config = Settings()
    simulator = UavSimulator(config)
    start = datetime(2026, 9, 7, tzinfo=timezone.utc)
    first = simulator.tick(start)
    assert len(first) == 5
    for step in range(1, 601):
        previous = simulator.latest.copy()
        for packet in simulator.tick(start + timedelta(seconds=step)):
            old = previous[packet.uavId]
            metres = math.hypot((packet.longitude - old.longitude) * 111195 * math.cos(math.radians(packet.latitude)),
                                (packet.latitude - old.latitude) * 111195)
            assert 0 < metres <= packet.speed * 1.001
            bounds = config.simulation_bounds
            assert bounds.west <= packet.longitude <= bounds.east
            assert bounds.south <= packet.latitude <= bounds.north
            assert abs(packet.altitude - old.altitude) <= 0.201
            assert abs(packet.signal - old.signal) <= 0.101
    for packet in first:
        last = simulator.latest[packet.uavId]
        assert last.battery == pytest.approx(packet.battery - 3)
        assert last.heading != packet.heading
    assert len(simulator.latest) == 5


def test_bounds_reflection_and_stall_step_limit():
    config = Settings()
    start = datetime(2026, 9, 7, tzinfo=timezone.utc)
    packet = UavSimulator(config).tick(start)[0].model_copy(update={
        "longitude": config.simulation_bounds.east, "heading": 90,
    })
    result = move(packet, start + timedelta(hours=1), config)
    assert result.longitude <= config.simulation_bounds.east
    assert result.heading > 180
    assert abs(result.latitude - packet.latitude) < 0.001


def test_configuration_and_wire_validation(monkeypatch):
    monkeypatch.setenv("FORESTFIRE_TELEMETRY_INTERVAL", "0.5")
    assert Settings.from_environment().telemetry_interval == 0.5
    with pytest.raises(ValidationError):
        Settings(telemetry_interval=0)
    with pytest.raises(ValidationError):
        SimulationBounds(west=120, east=119)
    packet = UavSimulator(Settings()).tick(datetime.now(timezone.utc))[0].model_dump()
    for invalid in ({"battery": -1}, {"heading": 360}, {"longitude": float("nan")},
                    {"timestamp": datetime.now()}, {"status": "broken"}):
        with pytest.raises(ValidationError):
            TelemetryMessage(**{**packet, **invalid})


class FakeClient:
    def __init__(self, fail=False, slow=False):
        self.fail = fail
        self.slow = slow
        self.received = []
        self.closed = False

    async def accept(self):
        pass

    async def send_json(self, message):
        if self.fail:
            raise OSError("broken transport")
        if self.slow:
            await asyncio.sleep(60)
        self.received.append(message)

    async def close(self):
        self.closed = True


class ConnectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_close_also_releases_connection(self):
        class FailedClose(FakeClient):
            async def close(self):
                raise OSError("close transport already gone")

        manager = ConnectionManager(0.01, 0.01)
        broken = FailedClose(fail=True)
        await manager.connect(broken)
        await manager.broadcast({"type": "test"})
        self.assertFalse(manager.clients)
        await manager.disconnect(broken)
        self.assertFalse(manager.clients)

    async def test_broadcast_failure_and_timeout_isolation(self):
        manager = ConnectionManager(send_timeout=0.01, close_timeout=0.01)
        good, broken, slow = FakeClient(), FakeClient(fail=True), FakeClient(slow=True)
        for client in (good, broken, slow):
            await manager.connect(client)
        await asyncio.wait_for(manager.broadcast({"type": "test"}), 0.5)
        self.assertEqual(good.received, [{"type": "test"}])
        self.assertEqual(manager.clients, {good})
        self.assertTrue(broken.closed and slow.closed)
        await manager.broadcast({"type": "next"})
        self.assertEqual(len(good.received), 2)
        await manager.close_all()
        self.assertFalse(manager.clients)

    async def test_simulator_task_continues_after_failed_client(self):
        manager = ConnectionManager(0.01, 0.01)
        good = FakeClient()
        await manager.connect(good)
        await manager.connect(FakeClient(fail=True))
        simulator = UavSimulator(Settings(telemetry_interval=0.01))
        task = asyncio.create_task(simulator.run(manager))
        try:
            for _ in range(100):
                if len(good.received) >= 15:
                    break
                await asyncio.sleep(0.01)
            self.assertGreaterEqual(len(good.received), 15)
            self.assertFalse(task.done())
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            await manager.close_all()
