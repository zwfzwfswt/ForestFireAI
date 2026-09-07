import asyncio
import ast
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as Value

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.mavsdk.mapper import TelemetryAggregator
from app.mavsdk.telemetry_source import MavsdkTelemetrySource
from app.telemetry.bus import TelemetryBus
from app.telemetry.models import TelemetryMessage
from app.websocket.manager import ConnectionManager
from mavsdk_fakes import FakeMavsdkClient
from test_backend import FakeClient


def aggregate(overrides=None):
    values = {
        "position": Value(longitude_deg=119.6, latitude_deg=30.2, relative_altitude_m=20, absolute_altitude_m=520),
        "velocity": Value(north_m_s=3, east_m_s=4, down_m_s=12),
        "heading": Value(heading_deg=270), "battery": Value(remaining_percent=82),
    }
    values.update(overrides or {})
    mapper = TelemetryAggregator("mock-uav-1", 5)
    for name, value in values.items():
        mapper.update(name, value, 10, datetime.now(timezone.utc))
    return mapper


def test_mapper_relative_altitude_horizontal_speed_heading_battery_and_signal():
    result = aggregate().snapshot(11)
    assert (result.longitude, result.latitude, result.altitude) == (119.6, 30.2, 20)
    assert result.speed == 5  # Down component deliberately excluded.
    assert result.heading == 270 and result.battery == 82
    assert result.signal is None and result.status == "online"
    assert result.timestamp.tzinfo is timezone.utc
    assert TelemetryMessage.model_validate_json(result.model_dump_json()) == result
    assert aggregate({"heading": Value(heading_deg=360)}).snapshot(11).heading == 0
    assert aggregate({"battery": Value(remaining_percent=0.5)}).snapshot(11).battery == 0.5


@pytest.mark.parametrize("invalid", [
    {"position": Value(longitude_deg=181, latitude_deg=30, relative_altitude_m=20)},
    {"position": Value(longitude_deg=119, latitude_deg=-91, relative_altitude_m=20)},
    {"position": Value(longitude_deg=119, latitude_deg=30, relative_altitude_m=float("nan"))},
    {"position": Value(longitude_deg=119, latitude_deg=30, absolute_altitude_m=520)},
    {"heading": Value(heading_deg=-1)}, {"heading": Value(heading_deg=361)},
    {"heading": Value(heading_deg=float("inf"))},
    {"battery": Value(remaining_percent=-1)}, {"battery": Value(remaining_percent=101)},
    {"battery": Value(remaining_percent=float("nan"))},
    {"velocity": Value(north_m_s=float("inf"), east_m_s=4)},
])
def test_mapper_invalid_frames_are_skipped(invalid, caplog):
    assert aggregate(invalid).snapshot(11) is None
    assert "Invalid MAVSDK telemetry" in caplog.text


def test_mapper_requires_all_fresh_streams_new_position_and_valid_timestamp():
    mapper = aggregate()
    assert mapper.snapshot(16) is None
    mapper.values.pop("battery")
    assert mapper.snapshot(11) is None
    mapper = aggregate()
    assert mapper.snapshot(11) is not None
    assert mapper.snapshot(12) is None
    position = mapper.values["position"][0]
    mapper.update("position", position, 12, datetime.now())
    assert mapper.snapshot(12) is None


def test_configuration_and_read_only_surface(monkeypatch):
    monkeypatch.setenv("TELEMETRY_INPUT_MODE", "mavsdk")
    monkeypatch.setenv("MAVSDK_UAV_ID", "mock-uav-1")
    config = Settings.from_environment()
    assert config.mavsdk_system_address == "udpin://0.0.0.0:14540"
    assert config.telemetry_input_mode == "mavsdk"
    for values in ({"mavsdk_system_address": "udp://:14540"}, {"mavsdk_connect_timeout": 0},
                   {"mavsdk_reconnect_interval": 0}, {"mavsdk_system_address": "udpin://localhost:0"}):
        with pytest.raises(ValidationError):
            Settings(**values)
    forbidden = {"arm", "disarm", "takeoff", "land", "goto_location", "upload_mission",
                 "action", "mission", "offboard", "param", "set_rate_position", "set_param_float"}
    for file in (Path(__file__).parents[1] / "app/mavsdk").glob("*.py"):
        tree = ast.parse(file.read_text(encoding="utf8"))
        assert not {node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)} & forbidden
    routes = {route.path for route in create_app(Settings()).routes}
    assert not routes & {"/arm", "/takeoff", "/land", "/mission", "/goto"}


def test_mavsdk_system_status_and_no_simulator(monkeypatch):
    monkeypatch.setattr("app.mavsdk.telemetry_source.ReadOnlyMavsdkClient", FakeMavsdkClient)
    app = create_app(Settings(telemetry_input_mode="mavsdk", mavsdk_telemetry_interval=0.05))
    with TestClient(app) as client:
        assert app.state.simulator_task is None
        with client.websocket_connect("/ws/telemetry") as ws:
            packet = ws.receive_json()
            assert packet["signal"] is None and packet["speed"] == 5
            assert client.get("/api/v1/system/status").json() == {
                "backend": "ok", "mqtt": "disabled", "telemetryInputMode": "mavsdk",
                "mavsdk": "connected", "mavsdkUavId": "mock-uav-1", "connectedWebSocketClients": 1,
            }
    assert app.state.mavsdk.status == "disconnected"
    assert app.state.mavsdk._task is None


async def wait_for(predicate):
    async with asyncio.timeout(2):
        while not predicate():
            await asyncio.sleep(0.01)


class SourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_official_client_closes_channel_and_native_process_without_aircraft(self):
        import socket
        from app.mavsdk.client import ReadOnlyMavsdkClient
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        client = ReadOnlyMavsdkClient()
        try:
            try:
                await asyncio.wait_for(client.connect(f"udpin://127.0.0.1:{port}"), 0.5)
            except TimeoutError:
                pass  # Native server may wait for a vehicle before serving gRPC.
            process = client._process
            self.assertIsNotNone(process)
        finally:
            await client.close()
        self.assertIsNotNone(process.poll())
        self.assertIsNone(client._channel)
        self.assertIsNone(client._process)

    async def test_source_bus_websocket_disconnect_reconnect_shutdown(self):
        clients = []
        def factory():
            client = FakeMavsdkClient()
            clients.append(client)
            return client
        bus = TelemetryBus()
        manager = ConnectionManager(0.05, 0.05)
        browser, other = FakeClient(), FakeClient()
        await manager.connect(browser)
        await manager.connect(other)
        bus.subscribe(manager.handle_telemetry)
        config = Settings(mavsdk_telemetry_interval=0.05, mavsdk_reconnect_interval=0.05)
        source = MavsdkTelemetrySource(config, bus, factory)
        try:
            await source.start()
            task = source._task
            await source.start()
            self.assertIs(task, source._task)
            await wait_for(lambda: len(browser.received) >= 3)
            self.assertEqual(source.status, "connected")
            self.assertEqual(browser.received, other.received)
            clients[0].disconnect.set()
            await wait_for(lambda: clients[0].closed)
            self.assertFalse(clients[0].active_streams)
            await wait_for(lambda: len(clients) == 2 and source.status == "connected")
            count = len(browser.received)
            await wait_for(lambda: len(browser.received) > count)
        finally:
            await source.stop()
            await source.stop()
            await manager.close_all()
        self.assertTrue(all(client.closed and not client.active_streams for client in clients))
        self.assertFalse([t for t in asyncio.all_tasks() if t.get_name().startswith("mavsdk-")])

    async def test_connection_timeout_and_stop_during_retry(self):
        client = FakeMavsdkClient()
        client.initial_connected = False
        source = MavsdkTelemetrySource(Settings(mavsdk_connect_timeout=0.05, mavsdk_reconnect_interval=1),
                                        TelemetryBus(), lambda: client)
        await source.start()
        await wait_for(lambda: source.status == "disconnected")
        await source.stop()
        self.assertTrue(client.closed)
        self.assertFalse(client.active_streams)

    async def test_cancel_during_connect_and_error_recovery(self):
        client = FakeMavsdkClient()
        client.connect_delay = 60
        source = MavsdkTelemetrySource(Settings(), TelemetryBus(), lambda: client)
        await source.start()
        await asyncio.sleep(0.01)
        await source.stop()
        self.assertTrue(client.closed)
        def failed():
            raise OSError("SDK unavailable")
        source = MavsdkTelemetrySource(Settings(mavsdk_reconnect_interval=1), TelemetryBus(), failed)
        await source.start()
        await wait_for(lambda: source.status == "error")
        await source.stop()

    async def test_frozen_position_is_not_republished(self):
        packets = []
        async def receive(packet):
            packets.append(packet)
        bus = TelemetryBus()
        bus.subscribe(receive)
        client = FakeMavsdkClient()
        source = MavsdkTelemetrySource(Settings(mavsdk_telemetry_interval=0.05), bus, lambda: client)
        try:
            await source.start()
            await wait_for(lambda: len(packets) >= 2)
            client.freeze_position = True
            await asyncio.sleep(0.1)
            count = len(packets)
            await asyncio.sleep(0.2)
            self.assertEqual(len(packets), count)
        finally:
            await source.stop()
