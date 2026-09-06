import asyncio
import os
import subprocess
import sys
from starlette.requests import Request

from app.api.routes import system_status
from app.core.config import Settings
from app.main import create_app
from app.mqtt.consumer import MqttConsumer
from mosquitto_harness import MosquittoHarness
from test_backend import FakeClient


async def wait_for(predicate, timeout=12):
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.025)


def test_real_broker_simulator_consumer_bus_websocket_recovery(tmp_path):
    broker = MosquittoHarness(tmp_path)
    async def scenario():
        config = Settings(telemetry_input_mode="mqtt", mqtt_port=broker.port, telemetry_interval=0.05)
        app = create_app(config)
        # Start the application BEFORE the broker, then recover without restarting it.
        async with app.router.lifespan_context(app):
            await wait_for(lambda: app.state.mqtt.status == "reconnecting")
            broker.start()
            await wait_for(lambda: app.state.mqtt.status == "connected")
            first, second = FakeClient(), FakeClient()
            await app.state.connections.connect(first)
            await app.state.connections.connect(second)
            await app.state.connections.connect(FakeClient(fail=True))
            await wait_for(lambda: len(first.received) >= 15 and len(second.received) >= 15)
            assert len({p["uavId"] for p in first.received}) == 5
            assert first.received[0]["timestamp"] < first.received[-1]["timestamp"]
            assert len(app.state.connections.clients) == 2
            assert await system_status(Request({"type": "http", "app": app})) == {
                "backend": "ok", "mqtt": "connected", "telemetryInputMode": "mqtt",
                "connectedWebSocketClients": 2,
            }
            assert not app.state.simulator_task.done()
            broker.stop()
            await wait_for(lambda: app.state.mqtt.status == "reconnecting")
            assert (await system_status(Request({"type": "http", "app": app})))["mqtt"] == "reconnecting"
            count = len(first.received)
            broker.start()
            await wait_for(lambda: app.state.mqtt.status == "connected" and len(first.received) > count + 10)
            await app.state.connections.disconnect(second)
            assert len(app.state.connections.clients) == 1
        assert app.state.mqtt.status == "disconnected"
        assert not app.state.connections.clients
        assert app.state.simulator_task.done()
    try:
        asyncio.run(scenario())
    finally:
        broker.stop()


def test_real_broker_bad_packets_then_dev_publisher(tmp_path, caplog):
    broker = MosquittoHarness(tmp_path)
    async def scenario():
        broker.start()
        config = Settings(telemetry_input_mode="mqtt", mqtt_port=broker.port, simulator_enabled=False)
        app = create_app(config)
        async with app.router.lifespan_context(app):
            await wait_for(lambda: app.state.mqtt.status == "connected")
            receiver = FakeClient()
            await app.state.connections.connect(receiver)
            publisher = MqttConsumer(config)
            await publisher.start()
            try:
                await wait_for(lambda: publisher.status == "connected")
                for payload in ("{", "{}", '{"status":"unknown"}'):
                    publisher._client.publish("forestfire/uav/mock-uav-1/telemetry", payload)
                await wait_for(lambda: "invalid payload" in caplog.text)
                assert not receiver.received
                process = subprocess.Popen([sys.executable, "tools/mqtt_uav_publisher.py", "--count", "1", "--interval", "0.05"],
                    env={**os.environ, "MQTT_PORT": str(broker.port)},
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                try:
                    await wait_for(lambda: len(receiver.received) >= 5)
                    assert {p["uavId"] for p in receiver.received} == {"mock-uav-1"}
                finally:
                    process.terminate()
                    process.wait(timeout=5)
            finally:
                await publisher.stop()
    try:
        asyncio.run(scenario())
    finally:
        broker.stop()
