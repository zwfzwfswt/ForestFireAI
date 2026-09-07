"""TEST ONLY entrypoint: SDK-shaped fake -> production source/bus/WS -> browser."""
from app.core.config import Settings
from app.main import create_app
import app.mavsdk.telemetry_source as source_module
from mavsdk_fakes import FakeMavsdkClient

source_module.ReadOnlyMavsdkClient = FakeMavsdkClient
app = create_app(Settings(telemetry_input_mode="mavsdk"))
