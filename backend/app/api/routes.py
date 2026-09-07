from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.get("/api/v1/health")
async def health():
    # Explicit V1 health contract, not the existing admin API response envelope.
    return {"status": "ok", "service": "ForestFireAI Backend"}


@router.get("/api/v1/system/status")
async def system_status(request: Request):
    state = request.app.state
    result = {
        "backend": "ok",
        "mqtt": state.mqtt.status if state.mqtt is not None else "disabled",
        "telemetryInputMode": state.config.telemetry_input_mode,
        "connectedWebSocketClients": len(state.connections.clients),
    }
    if state.config.telemetry_input_mode == "mavsdk":
        result.update(mavsdk=state.mavsdk.status, mavsdkUavId=state.config.mavsdk_uav_id)
    return result


@router.websocket("/ws/telemetry")
async def telemetry(websocket: WebSocket):
    manager = websocket.app.state.connections
    try:
        await manager.connect(websocket)
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            # Push-only V1: ignore application messages; there are no control commands.
    except (WebSocketDisconnect, OSError, RuntimeError):
        pass
    finally:
        await manager.disconnect(websocket)
