import asyncio
import logging
from contextlib import suppress
from queue import Empty, Full, Queue

import paho.mqtt.client as mqtt
from pydantic import ValidationError

from app.core.config import Settings
from app.telemetry.bus import TelemetryBus
from app.telemetry.models import TelemetryMessage

logger = logging.getLogger(__name__)


def parse_message(topic: str, payload: bytes, config: Settings) -> TelemetryMessage | None:
    prefix = config.mqtt_topic_prefix + "/"
    if not topic.startswith(prefix):
        logger.warning("invalid payload: unexpected MQTT topic")
        return None
    levels = topic[len(prefix):].split("/")
    if len(levels) != 2 or not levels[0] or levels[1] != "telemetry" or any(c in levels[0] for c in "+#\x00"):
        logger.warning("invalid payload: unexpected MQTT topic")
        return None
    if len(payload) > config.mqtt_max_payload_bytes:
        logger.warning("invalid payload: MQTT size limit")
        return None
    try:
        message = TelemetryMessage.model_validate_json(payload)
    except (ValidationError, ValueError):
        # Do not log raw payloads or credentials.
        logger.warning("invalid payload: JSON/schema validation failed")
        return None
    if message.uavId != levels[0]:
        logger.warning("UAV ID mismatch: MQTT topic and payload disagree")
        return None
    return message


class MqttConsumer:
    """Paho network thread -> bounded queue -> asyncio bus.

    The same connection can publish simulator packets; they reach the bus only
    after returning through the broker. With no bus this is a publisher only.
    """
    def __init__(self, config: Settings, bus: TelemetryBus | None = None):
        self.config = config
        self.bus = bus
        self.status = "disconnected"
        self._active = False
        self._queue: Queue[TelemetryMessage] = Queue(config.mqtt_queue_size)
        self._task: asyncio.Task | None = None
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.connect_timeout = 3
        self._client.reconnect_delay_set(1, config.mqtt_reconnect_max)
        self._client.max_queued_messages_set(config.mqtt_queue_size)
        if config.mqtt_username:
            self._client.username_pw_set(config.mqtt_username, config.mqtt_password.get_secret_value())
        self._client.on_connect = self._on_connect
        self._client.on_connect_fail = self._on_connect_fail
        self._client.on_disconnect = self._on_disconnect
        self._client.on_subscribe = self._on_subscribe
        self._client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if not self._active:
            return
        if reason_code.is_failure:
            self.status = "error"
            logger.warning("MQTT connection rejected")
        elif self.bus is not None:
            result, _ = client.subscribe(f"{self.config.mqtt_topic_prefix}/+/telemetry", qos=0)
            if result != mqtt.MQTT_ERR_SUCCESS:
                self.status = "error"
                logger.warning("MQTT subscription failed")
        else:
            self.status = "connected"
            logger.info("MQTT connected")

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties):
        if not self._active:
            return
        self.status = "error" if any(code.is_failure for code in reason_codes) else "connected"
        logger.log(logging.WARNING if self.status == "error" else logging.INFO,
                   "MQTT subscription rejected" if self.status == "error" else "MQTT connected")

    def _on_connect_fail(self, client, userdata):
        if self._active:
            self.status = "reconnecting"
            logger.warning("MQTT reconnecting")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.status = "reconnecting" if self._active else "disconnected"
        logger.info("MQTT disconnected")
        if self._active:
            logger.warning("MQTT reconnecting")

    def _on_message(self, client, userdata, packet):
        if not self._active:
            return
        message = parse_message(packet.topic, packet.payload, self.config)
        if message is not None:
            try:
                self._queue.put_nowait(message)
            except Full:
                # Bounded memory and latency: drop oldest, never block network I/O.
                with suppress(Empty):
                    self._queue.get_nowait()
                self._queue.put_nowait(message)

    async def _consume(self):
        while True:
            try:
                message = self._queue.get_nowait()
            except Empty:
                await asyncio.sleep(self.config.mqtt_poll_interval)
            else:
                await self.bus.publish(message)

    async def start(self):
        if self._active:
            return
        self._active = True
        self.status = "connecting"
        if self.bus is not None:
            self._task = asyncio.create_task(self._consume(), name="mqtt-telemetry-consumer")
        self._client.connect_async(self.config.mqtt_host, self.config.mqtt_port, self.config.mqtt_keepalive)
        self._client.loop_start()

    async def publish(self, message: TelemetryMessage):
        # QoS 0 / no retain: stale samples are not accumulated while disconnected.
        if self._active and self.status == "connected":
            self._client.publish(f"{self.config.mqtt_topic_prefix}/{message.uavId}/telemetry",
                                 message.model_dump_json(exclude={"type"}), qos=0, retain=False)

    async def stop(self):
        self._active = False
        self._client.disconnect()
        await asyncio.to_thread(self._client.loop_stop)
        if self._task is not None:
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        while not self._queue.empty():
            self._queue.get_nowait()
        self.status = "disconnected"
