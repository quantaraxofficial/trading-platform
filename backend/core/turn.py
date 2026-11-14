"""ICE servers for the collab voice call. Two browsers on different networks (mobile data, office
Wi-Fi behind NAT) often can't reach each other directly; the TURN relay (coturn, see
deploy/prod/docker-compose.yml) carries the audio between them then. Its credentials are the
TURN REST kind: valid for a day, made from the shared secret (TURN_SECRET) and checked by coturn
itself, so nothing is stored and a leaked one soon expires.
"""
import base64
import hashlib
import hmac
import os
import time

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session

STUN = {"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}
TTL = 24 * 3600


def ice_servers_for(uid):
    secret = os.environ.get("TURN_SECRET", "")
    host = os.environ.get("TURN_HOST", "")
    servers = [STUN]
    if secret and host:
        username = f"{int(time.time()) + TTL}:{uid[:32]}"
        credential = base64.b64encode(hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()).decode()
        servers.append({
            "urls": [f"turn:{host}:3478?transport=udp", f"turn:{host}:3478?transport=tcp"],
            "username": username,
            "credential": credential,
        })
    return servers


@api_view(['GET'])
def ice_servers(request, uid):
    _profile, denied = require_session(request, uid)
    if denied:
        return denied
    return Response({"iceServers": ice_servers_for(uid), "ttl": TTL})
