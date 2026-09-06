"""DEV TOOL: publish 1..5 mock UAVs; never connect to real devices."""
import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Support the documented `python tools/mqtt_uav_publisher.py` invocation.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import Settings
from app.mqtt.consumer import MqttConsumer
from app.simulator.fleet import UavSimulator


async def run(count: int, interval: float | None):
    config = Settings.from_environment()
    if interval is not None:
        config = Settings.model_validate({**config.model_dump(), "telemetry_interval": interval})
    publisher = MqttConsumer(config)
    try:
        await publisher.start()
        await UavSimulator(config, count).run(publisher.publish)
    finally:
        await publisher.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DEV TOOL / MOCK MQTT UAV publisher")
    parser.add_argument("--count", type=int, choices=range(1, 6), default=5)
    parser.add_argument("--interval", type=float, help="Seconds; defaults to telemetry_interval (1Hz)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(run(args.count, args.interval))
    except KeyboardInterrupt:
        pass
