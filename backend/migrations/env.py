"""Alembic environment.

The database URL comes from taskflow.db rather than alembic.ini so that one
env var (TASKFLOW_DB_PATH) governs the application, the test suite and the
disposable E2E database alike.
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from taskflow.db import Base, database_url

# Importing the model registers it on Base.metadata. Without this import
# autogenerate sees an empty metadata and produces an empty revision.
from taskflow.models import task as _task_model  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", database_url())

if config.config_file_name is not None:
    # disable_existing_loggers defaults to True, which switches off every
    # logger not named in alembic.ini — including taskflow.telemetry. The
    # symptom is that the record simply stops being written in any process
    # that has run a migration, with no error anywhere. Found by the unit
    # tests failing only when the suite ran in full.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _record_migration() -> None:
    """Record that a migration was applied (FR-009).

    Imported lazily and wrapped by the sink's own never-raise contract, so a
    broken telemetry destination can never stop `alembic upgrade head`.
    """
    from taskflow import telemetry

    telemetry.record(
        "lifecycle",
        "app_lifecycle",
        event="migration_applied",
        revision=str(context.get_context().get_current_revision()),
    )


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite cannot ALTER COLUMN. Alembic emulates it by creating a new
        # table, copying rows and swapping. Not needed for the initial
        # revision, but any future column change on this table must use
        # op.batch_alter_table() — render_as_batch makes autogenerate emit it.
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()
            _record_migration()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
