"""Errors: one shape for every failed request.

When something goes wrong the browser always gets the same JSON, so the game can show a
useful message without special cases:

    {"error": {"code": "not_found", "message": "Not Found"}}

"code" is a short word the browser can check. "message" is plain English for people.
A response never contains a stack trace, a key or any other secret.

Used by: app.py (installs the handlers below) and any module that wants to stop a request
with a clear error (auth.py, supabase_admin.py, adapters/base.py).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from server.game.case_cache import is_case_path

logger = logging.getLogger(__name__)

# Short codes for the HTTP statuses that FastAPI itself raises (404, 405, ...).
CODE_BY_STATUS = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "too_many_requests",
    500: "server_error",
    503: "unavailable",
}

# A request with many mistakes should not produce a huge message.
MAX_PROBLEMS_SHOWN = 5


class ApiError(Exception):
    """An error we choose to show to the browser. Raise it from any route or helper.

    Example: raise ApiError(404, "no_such_island", "That island does not exist.")
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.headers = headers


def error_response(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Build the JSON response in the one standard shape."""
    body = {"error": {"code": code, "message": message}}
    response = JSONResponse(status_code=status_code, content=body, headers=headers)
    response.headers["Cache-Control"] = "private, no-store"
    return response


def describe_validation_problems(error: RequestValidationError) -> str:
    """Turn the list of mistakes into one short sentence.

    It names where each mistake is (for example "query.limit") but never repeats the value
    the browser sent.
    """
    problems = []
    for item in error.errors()[:MAX_PROBLEMS_SHOWN]:
        place = ".".join(str(part) for part in item["loc"])
        problems.append(f"{place}: {item['msg']}")
    return "The request is not valid. " + "; ".join(problems)


async def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
    """An error we raised on purpose with ApiError."""
    return error_response(error.status_code, error.code, error.message, error.headers)


async def handle_http_error(request: Request, error: StarletteHTTPException) -> JSONResponse:
    """Errors FastAPI raises by itself, such as 404 (no such URL) and 405 (wrong method)."""
    code = CODE_BY_STATUS.get(error.status_code, "http_error")
    return error_response(error.status_code, code, str(error.detail), error.headers)


async def handle_validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    """The browser sent something that does not fit the route (a word where a number belongs)."""
    return error_response(422, "validation_error", describe_validation_problems(error))


async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
    """A bug. Log its class only: paths and exception details can contain private data."""
    logger.error("Unexpected server error: %s", type(error).__name__)
    return error_response(500, "server_error", "Something went wrong on our side. Try again.")


def register_error_handlers(app: FastAPI) -> None:
    """Tell the app which function answers which kind of error."""
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(StarletteHTTPException, handle_http_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
