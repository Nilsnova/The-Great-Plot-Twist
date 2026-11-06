"""ASGI request timing and safe cache defaults. Used by create_app, without storing input."""

import json
import logging
from time import perf_counter

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from server.errors import handle_unexpected_error

# Inherit Uvicorn's configured stderr handler, rather than logging raw access URLs.
logger = logging.getLogger("uvicorn.error.requests")
logger.setLevel(logging.INFO)


def route_template(scope: Scope) -> str:
    """Only developer-defined templates; an unmatched URL can contain player input."""
    # FastAPI 0.162 keeps included router prefixes in its effective route context.
    effective = scope.get("fastapi", {}).get("effective_route_context")
    return getattr(effective or scope.get("route"), "path", "unmatched")


class RequestPolicy:
    """Time complete responses, preserve explicit public caches, and default to no-store."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = perf_counter()
        status = 500
        started = False

        async def send_response(message: Message) -> None:
            nonlocal status, started
            if message["type"] == "http.response.start":
                status = message["status"]
                started = True
                MutableHeaders(scope=message).setdefault("cache-control", "private, no-store")
            await send(message)

        try:
            await self.app(scope, receive, send_response)
        except Exception as error:
            # Do not let the server print a traceback containing private exception details.
            if started:
                raise RuntimeError("Response stream failed") from None
            response = await handle_unexpected_error(Request(scope), error)
            await response(scope, receive, send_response)
        finally:
            logger.info(json.dumps({
                "route": route_template(scope), "status": status,
                "duration_ms": round((perf_counter() - start) * 1000, 3),
            }))
