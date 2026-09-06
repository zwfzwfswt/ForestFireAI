import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self, send_timeout: float, close_timeout: float):
        self.clients: set[WebSocket] = set()
        self.send_timeout = send_timeout
        self.close_timeout = close_timeout

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.clients.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        self.clients.discard(websocket)
        try:
            await asyncio.wait_for(websocket.close(), self.close_timeout)
        except Exception:
            # A disconnected/failed transport may reject close; it is already removed.
            logger.debug("WebSocket close failed", exc_info=True)

    async def _send(self, websocket: WebSocket, message: dict):
        try:
            await asyncio.wait_for(websocket.send_json(message), self.send_timeout)
        except Exception:
            logger.debug("Removing failed or slow telemetry client", exc_info=True)
            await self.disconnect(websocket)

    async def broadcast(self, message: dict):
        # Snapshot permits a connection to disappear while another send is awaiting.
        await asyncio.gather(*(self._send(client, message) for client in tuple(self.clients)))

    async def close_all(self):
        await asyncio.gather(*(self.disconnect(client) for client in tuple(self.clients)))
