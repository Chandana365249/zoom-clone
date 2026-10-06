from fastapi import APIRouter

from app.services.ice import get_ice_servers

router = APIRouter(prefix="/api", tags=["webrtc"])


@router.get("/ice-servers")
def ice_servers() -> dict[str, list[dict]]:
    """STUN/TURN servers for RTCPeerConnection. Public: guests joining by link need them too."""
    return {"ice_servers": get_ice_servers()}
