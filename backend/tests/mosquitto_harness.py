"""Opt-in real Mosquitto process; isolated loopback port, no system service."""
import os
import socket
import subprocess
import time
from pathlib import Path

import pytest


class MosquittoHarness:
    def __init__(self, directory: Path):
        self.executable = os.environ.get("MOSQUITTO_EXECUTABLE")
        if not self.executable:
            pytest.skip("Set MOSQUITTO_EXECUTABLE for real broker integration (not a mocked pass)")
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        self.config = directory / "mosquitto.conf"
        source = Path(__file__).resolve().parents[2] / "deploy/mqtt/mosquitto.conf"
        self.config.write_text(source.read_text().replace("listener 1883", f"listener {self.port} 127.0.0.1"))
        self.process = None

    def start(self):
        self.process = subprocess.Popen([self.executable, "-c", str(self.config)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        for _ in range(100):
            if self.process.poll() is not None:
                raise RuntimeError("Mosquitto exited before binding")
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.1):
                    return
            except OSError:
                time.sleep(0.05)
        self.stop()
        raise RuntimeError("Mosquitto startup timeout")

    def stop(self):
        if self.process is not None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
            self.process = None
