"""Keep all case responses private, including handled dependency and validation errors."""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def is_case_path(path: str) -> bool:
    return path in ("/api/case", "/api/crews/me/orders") or path.startswith(
        ("/api/case/", "/api/host/case/", "/api/board/", "/api/finale/")
    )


class CaseCacheControl:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not is_case_path(path):
            await self.app(scope, receive, send)
            return

        async def private(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["Cache-Control"] = "private, no-store"
            await send(message)

        await self.app(scope, receive, private)
