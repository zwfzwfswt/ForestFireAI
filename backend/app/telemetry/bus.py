"""Process-local, awaited dispatch; no source-specific knowledge or history."""
import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.telemetry.models import TelemetryMessage

TelemetryHandler = Callable[[TelemetryMessage], Awaitable[None]]
logger = logging.getLogger(__name__)


class TelemetryBus:
    def __init__(self):
        self._handlers: set[TelemetryHandler] = set()

    def subscribe(self, handler: TelemetryHandler):
        self._handlers.add(handler)

    def unsubscribe(self, handler: TelemetryHandler):
        self._handlers.discard(handler)

    async def publish(self, message: TelemetryMessage):
        if not isinstance(message, TelemetryMessage):
            raise TypeError("TelemetryBus requires TelemetryMessage")
        async def dispatch(handler):
            try:
                await handler(message)
            except Exception:
                logger.exception("Telemetry subscriber failed")
        await asyncio.gather(*(dispatch(handler) for handler in tuple(self._handlers)))
