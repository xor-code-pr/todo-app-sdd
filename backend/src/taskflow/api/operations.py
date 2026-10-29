"""Mapping from a route to the operation name recorded in telemetry.

The vocabulary is closed (data-model.md § The operation vocabulary). A value
outside it is a defect, not an extension point — which is only enforceable if
there is exactly one place that produces one.

Four call sites justify the module under Principle V: the three exception
handlers and the timing middleware all need it.
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.routing import Route

#: Keyed by (method, path template). The template, never the literal path:
#: ``/api/tasks/42`` carries an identifier that is useless for aggregation and
#: one step from carrying something that is not (FR-007, data-model.md).
_OPERATIONS: dict[tuple[str, str], str] = {
    ("GET", "/api/tasks"): "task_list_read",
    ("POST", "/api/tasks"): "task_created",
    # PATCH cannot be resolved more finely here. Completing and reopening are
    # the same request to the transport layer, and telling them apart would
    # mean reading the body in an exception handler — which is where the
    # user's content is. The service layer records the finer-grained
    # task_completed / task_reopened once it legitimately knows.
    ("PATCH", "/api/tasks/{task_id}"): "task_updated",
    ("DELETE", "/api/tasks/{task_id}"): "task_deleted",
    ("POST", "/api/telemetry"): "telemetry_reported",
}

#: No route matched — a 404 on an unknown path, or a request that failed
#: before routing. Recording the literal path here would reintroduce exactly
#: the identifier leak the templates exist to prevent.
UNMATCHED = "unmatched"


def path_template(request: Request) -> str:
    """The matched route's template, or ``UNMATCHED``."""
    route = request.scope.get("route")
    if isinstance(route, Route):
        return route.path
    return UNMATCHED


def operation_for(request: Request) -> str:
    """The telemetry operation this request belongs to."""
    return _OPERATIONS.get((request.method, path_template(request)), "http_request")
