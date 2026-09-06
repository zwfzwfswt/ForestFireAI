from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.get("/api/v1/health")
async def health():
    # Explicit V1 health contract, not the existing admin API response envelope.
    return {"status": "ok", "service": "ForestFireAI Backend"}


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
