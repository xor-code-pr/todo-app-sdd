"""The browser's route into the record.

Thin, like every router here: validate, delegate, return. The one unusual
thing is the response code, and it is worth stating plainly.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from taskflow import telemetry
from taskflow.schemas.task import ErrorResponse
from taskflow.schemas.telemetry import TelemetryReport

router = APIRouter(prefix="/api", tags=["telemetry"])


@router.post(
    "/telemetry",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={422: {"model": ErrorResponse, "description": "Validation failed"}},
    summary="Report a browser-side failure to the local record",
)
def report(payload: TelemetryReport) -> None:
    """Record a failure the browser observed. Always answers 204.

    **Including when recording did nothing.** This endpoint exists to report
    failures; if it answered with an error when the sink was broken, the
    browser would have a failed request to report, which would fail, and so
    on. Making the failure unobservable to the caller is the simplest way to
    stop that loop (FR-006a).

    A malformed body is not an exception to this. That is a defect in the
    caller rather than a runtime failure, and it should be loud — so it
    leaves as a 422 through the usual envelope.

    Nothing here is transmitted anywhere: the entry goes to a file on this
    machine, and this route is the local server the browser already talks to.
    """
    telemetry.record(
        "failure",
        payload.operation,
        code=payload.code,
        duration_ms=payload.duration_ms,
        source="browser",
    )
