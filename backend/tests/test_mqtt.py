import asyncio
import json
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.mqtt.consumer import MqttConsumer, parse_message
from app.simulator.fleet import UavSimulator
from app.telemetry.bus import TelemetryBus


def sample():
    return UavSimulator(Settings()).tick(datetime.now(timezone.utc))[0]


def test_valid_payload_and_topic():
    packet = sample()
    assert parse_message(f"forestfire/uav/{packet.uavId}/telemetry",
                         packet.model_dump_json(exclude={"type"}).encode(), Settings()) == packet


@pytest.mark.parametrize("payload", [b"{", b"{}", b"null", b"[]", b"\xff",
    {"longitude": 181}, {"latitude": -91}, {"status": "unknown"}, {"battery": -1},
    {"speed": float("nan")}, {"timestamp": "not-a-date"}])
def test_invalid_payload_is_rejected(payload, caplog):
    if isinstance(payload, dict):
        payload = json.dumps({**sample().model_dump(mode="json"), **payload}).encode()
    assert parse_message("forestfire/uav/mock-uav-1/telemetry", payload, Settings()) is None
    assert "invalid payload" in caplog.text


def test_id_mismatch_and_bad_topics(caplog):
    payload = sample().model_dump_json().encode()
    assert parse_message("forestfire/uav/another/telemetry", payload, Settings()) is None
    assert "UAV ID mismatch" in caplog.text
    for topic in ("other/uav/mock-uav-1/telemetry", "forestfire/uav//telemetry",
                  "forestfire/uav/mock-uav-1/telemetry/extra", "forestfire/uav/+/telemetry"):
        assert parse_message(topic, payload, Settings()) is None
    assert parse_message("forestfire/uav/mock-uav-1/telemetry", b" " * 16385, Settings()) is None


def test_mqtt_configuration(monkeypatch):
    monkeypatch.setenv("TELEMETRY_INPUT_MODE", "mqtt")
    monkeypatch.setenv("MQTT_PORT", "2883")
    monkeypatch.setenv("MQTT_TOPIC_PREFIX", "test/uav")
    monkeypatch.setenv("MQTT_PASSWORD", "secret-for-test")
    config = Settings.from_environment()
    assert config.mqtt_port == 2883 and config.telemetry_input_mode == "mqtt"
    assert config.mqtt_topic_prefix == "test/uav"
    assert "secret-for-test" not in repr(config)
    for kwargs in ({"mqtt_topic_prefix": "forestfire/+"}, {"mqtt_port": 0},
                   {"mqtt_topic_prefix": "/empty"}, {"telemetry_input_mode": "invalid"}):
        with pytest.raises(ValidationError):
            Settings(**kwargs)


def test_direct_status_and_client_count():
    with TestClient(create_app(Settings())) as client:
        assert client.get("/api/v1/system/status").json() == {
            "backend": "ok", "mqtt": "disabled", "telemetryInputMode": "direct",
            "connectedWebSocketClients": 0,
        }
        with client.websocket_connect("/ws/telemetry"):
            with client.websocket_connect("/ws/telemetry"):
                assert client.get("/api/v1/system/status").json()["connectedWebSocketClients"] == 2
        assert client.get("/api/v1/system/status").json()["connectedWebSocketClients"] == 0


class BusAndConsumerTests(unittest.IsolatedAsyncioTestCase):
    async def test_bus_subscribe_publish_unsubscribe_and_error_isolation(self):
        bus, received = TelemetryBus(), []
        async def good(packet):
            received.append(packet)
        async def broken(packet):
            raise ValueError("subscriber failure")
        bus.subscribe(good)
        bus.subscribe(good)
        bus.subscribe(broken)
        packet = sample()
        await bus.publish(packet)
        self.assertEqual(received, [packet])
        bus.unsubscribe(good)
        bus.unsubscribe(good)
        await bus.publish(packet)
        self.assertEqual(received, [packet])
        with self.assertRaises(TypeError):
            await bus.publish({})

    async def test_direct_simulator_publishes_models_to_bus(self):
        bus, received = TelemetryBus(), []
        async def receive(packet):
            received.append(packet)
        bus.subscribe(receive)
        task = asyncio.create_task(UavSimulator(Settings(telemetry_interval=0.01)).run(bus.publish))
        try:
            await asyncio.sleep(0.05)
            self.assertGreaterEqual(len(received), 10)
            self.assertEqual(len({p.uavId for p in received}), 5)
        finally:
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

    async def test_consumer_callbacks_queue_and_lifecycle(self):
        bus, received = TelemetryBus(), []
        async def receive(packet):
            received.append(packet)
        bus.subscribe(receive)
        consumer = MqttConsumer(Settings(mqtt_queue_size=2), bus)
        client = consumer._client = MagicMock()
        client.subscribe.return_value = (0, 1)
        await consumer.start()
        await consumer.start()
        self.assertEqual(client.loop_start.call_count, 1)
        self.assertEqual(consumer.status, "connecting")
        consumer._on_connect(client, None, None, SimpleNamespace(is_failure=False), None)
        client.subscribe.assert_called_once_with("forestfire/uav/+/telemetry", qos=0)
        consumer._on_subscribe(client, None, 1, [SimpleNamespace(is_failure=False)], None)
        self.assertEqual(consumer.status, "connected")
        packet = sample()
        await consumer.publish(packet)
        topic, payload = client.publish.call_args.args
        self.assertEqual(topic, f"forestfire/uav/{packet.uavId}/telemetry")
        self.assertEqual(parse_message(topic, payload.encode(), consumer.config), packet)
        self.assertFalse(received)  # Publishing must not bypass the broker.
        consumer._on_message(client, None, SimpleNamespace(topic=topic, payload=b"invalid"))
        for _ in range(20):
            consumer._on_message(client, None, SimpleNamespace(topic=topic, payload=payload.encode()))
        self.assertEqual(consumer._queue.qsize(), 2)
        await asyncio.sleep(0.05)
        self.assertEqual(len(received), 2)
        consumer._on_disconnect(client, None, None, None, None)
        self.assertEqual(consumer.status, "reconnecting")
        await consumer.publish(packet)
        self.assertEqual(client.publish.call_count, 1)
        consumer._on_connect_fail(client, None)
        self.assertEqual(consumer.status, "reconnecting")
        consumer._on_connect(client, None, None, SimpleNamespace(is_failure=False), None)
        self.assertEqual(client.subscribe.call_count, 2)
        consumer._on_subscribe(client, None, 2, [SimpleNamespace(is_failure=False)], None)
        self.assertEqual(consumer.status, "connected")
        task = consumer._task
        await consumer.stop()
        self.assertTrue(task.done())
        self.assertEqual(consumer.status, "disconnected")
        self.assertTrue(consumer._queue.empty())
        consumer._on_message(client, None, SimpleNamespace(topic=topic, payload=payload.encode()))
        self.assertTrue(consumer._queue.empty())

    async def test_broker_unavailable_does_not_prevent_app_start_or_stop(self):
        # An unused local port exercises Paho's actual initial-connect retry thread.
        import socket
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        app = create_app(Settings(telemetry_input_mode="mqtt", mqtt_port=port))
        async with app.router.lifespan_context(app):
            for _ in range(100):
                if app.state.mqtt.status == "reconnecting":
                    break
                await asyncio.sleep(0.05)
            self.assertEqual(app.state.mqtt.status, "reconnecting")
            self.assertFalse(app.state.simulator_task.done())
        self.assertEqual(app.state.mqtt.status, "disconnected")
