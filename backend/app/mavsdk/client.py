"""Lifecycle wrapper for official MAVSDK Python Core/Telemetry plugins only.

Own the server process and gRPC channel explicitly: System 3.17.2 has no public
async close method. Do not instantiate or expose command plugins.
"""
import asyncio
import os
import socket
import subprocess
from importlib.resources import files
from types import SimpleNamespace


class ReadOnlyMavsdkClient:
    def __init__(self):
        self._process = None
        self._channel = None
        self._core = None
        self._telemetry = None

    async def connect(self, address: str):
        from grpc import aio
        from mavsdk.core import Core
        from mavsdk.telemetry import Telemetry
        # Wheels on supported platforms contain the official native server.
        executable = files("mavsdk.bin").joinpath("mavsdk_server.exe" if os.name == "nt" else "mavsdk_server")
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        self._process = subprocess.Popen(
            [str(executable), "-p", str(port), address],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self._channel = aio.insecure_channel(f"127.0.0.1:{port}")
        await self._channel.channel_ready()
        manager = SimpleNamespace(channel=self._channel)
        self._core = Core(manager)
        self._telemetry = Telemetry(manager)

    def connection_state(self):
        return self._core.connection_state()

    def position(self):
        return self._telemetry.position()

    def velocity(self):
        return self._telemetry.velocity_ned()

    def heading(self):
        return self._telemetry.heading()

    def battery(self):
        return self._telemetry.battery()

    async def close(self):
        try:
            if self._channel is not None:
                await self._channel.close()
        finally:
            self._channel = None
            self._core = self._telemetry = None
            process, self._process = self._process, None
            if process is not None:
                if process.poll() is None:
                    process.terminate()
                try:
                    await asyncio.to_thread(process.wait, timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    await asyncio.to_thread(process.wait, timeout=3)
