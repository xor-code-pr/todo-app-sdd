"""Task routes.

Routers validate, delegate and serialise. No business rules, no queries —
those belong in services/ (constitution: domain logic is framework-free).

Routes arrive per user-story slice: GET and POST in US1, PATCH in US2,
DELETE in US3.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from taskflow.api.deps import get_session
from taskflow.models.task import Task
from taskflow.schemas.task import ErrorResponse, TaskCreate, TaskRead
from taskflow.services import tasks as tasks_service

router = APIRouter(prefix="/api", tags=["tasks"])

SessionDep = Annotated[Session, Depends(get_session)]

ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    422: {"model": ErrorResponse, "description": "Validation failed"},
}


@router.get(
    "/tasks",
    response_model=list[TaskRead],
    summary="List every task in display order",
)
def list_tasks(session: SessionDep) -> list[Task]:
    """Return all tasks already sorted — the client never re-sorts."""
    return tasks_service.list_tasks(session)


@router.post(
    "/tasks",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
    responses=ERROR_RESPONSES,
    summary="Create a task",
)
def create_task(payload: TaskCreate, session: SessionDep) -> Task:
    """Create a task. The title arrives raw; the schema has already trimmed
    and validated it through the same function the service uses."""
    return tasks_service.create_task(session, payload.title)
