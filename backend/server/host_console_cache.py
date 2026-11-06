"""Private security headers for console reads, writes and handled errors.

Used by app.py when mounting the host console; other host APIs keep their own cache policy.
"""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class HostConsoleHeaders:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        matches = (
            path == "/api/host/overview"
            or path == "/api/host/crews"
            or path.startswith("/api/host/crews/")
        )
        if scope["type"] != "http" or not matches:
            await self.app(scope, receive, send)
            return

        async def private(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["Referrer-Policy"] = "no-referrer"
            await send(message)

        await self.app(scope, receive, private)
