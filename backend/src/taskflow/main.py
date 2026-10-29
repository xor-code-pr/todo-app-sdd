"""Application factory, exception handlers and logging.

Every non-2xx response — framework-raised or domain-raised — leaves through
the same envelope. Two error shapes would mean two narrowing paths in the
generated TypeScript client, and the second one is always the one that gets
forgotten.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from taskflow.api.routers import tasks as tasks_router
from taskflow.services.errors import DomainError

logger = logging.getLogger("taskflow")

#: Domain codes that may be raised through Pydantic as a PydanticCustomError.
#: Anything else Pydantic reports is a malformed body, not a domain rejection.
_DOMAIN_CODES = {"TITLE_EMPTY", "TITLE_TOO_LONG", "TASK_NOT_FOUND"}

#: Transport mapping. Lives here, not on the exception, so the domain layer
#: stays free of HTTP concepts.
_STATUS_FOR_CODE = {
    "TITLE_EMPTY": 422,
    "TITLE_TOO_LONG": 422,
    "TASK_NOT_FOUND": 404,
    "VALIDATION_ERROR": 422,
    "INTERNAL_ERROR": 500,
}

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _envelope(code: str, message: str, field: str | None = None) -> dict[str, object]:
    return {"error": {"code": code, "message": message, "field": field}}


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s %(message)s",
    )

    app = FastAPI(
        title="TaskFlow",
        version="0.1.0",
        description="Core todo API for a single local user.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        status = _STATUS_FOR_CODE.get(exc.code, 500)
        # Expected, user-caused failures. The task id and code are useful for
        # a diagnosis; the task title is user content and adds nothing, so it
        # is never logged.
        logger.warning("domain error code=%s status=%s", exc.code, status)
        return JSONResponse(
            status_code=status,
            content=_envelope(exc.code, exc.message, exc.field),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}

        raw_type = str(first.get("type", ""))
        code = raw_type if raw_type in _DOMAIN_CODES else "VALIDATION_ERROR"
        message = str(first.get("msg", "Request body is invalid."))

        loc = first.get("loc", ())
        field = str(loc[-1]) if isinstance(loc, (list, tuple)) and loc else None

        status = _STATUS_FOR_CODE.get(code, 422)
        logger.warning("validation error code=%s field=%s", code, field)
        return JSONResponse(status_code=status, content=_envelope(code, message, field))

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        # Unexpected: log with a traceback, return nothing revealing.
        logger.exception("unhandled exception: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=_envelope("INTERNAL_ERROR", "An internal error occurred."),
        )

    app.include_router(tasks_router.router)

    return app


app = create_app()
