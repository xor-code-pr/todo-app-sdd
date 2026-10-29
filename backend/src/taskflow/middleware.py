"""Request timing.

One middleware, one signal: how long each request took and how it ended
(FR-007). It records the route *template* rather than the path that was
actually requested, for the reason given in ``api/operations.py``.

Registered inside CORS, not outside it. A preflight ``OPTIONS`` answered by
the CORS layer never reaches the router, so timing it would produce entries
with no route and no meaning. Ordering in this application's middleware stack
has caused real confusion before — a 500 raised above CORS carries no CORS
headers and arrives in the browser as an opaque transport error — so it is
chosen deliberately here rather than left to whichever line came first.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

from taskflow import telemetry
from taskflow.api.operations import operation_for, path_template

CallNext = Callable[[Request], Awaitable[Response]]


async def timing_middleware(request: Request, call_next: CallNext) -> Response:
    """Record one ``timing`` entry per request.

    The entry is written after the response is produced, so a failure inside
    ``record()`` cannot affect what the user receives — and ``record()``
    cannot raise in any case.
    """
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000

    # The router sets scope["route"] on the same scope dict this request
    # wraps, so the template is available only now, after call_next.
    telemetry.record(
        "timing",
        operation_for(request),
        method=request.method,
        path_template=path_template(request),
        status=response.status_code,
        duration_ms=round(duration_ms, 3),
    )

    return response
