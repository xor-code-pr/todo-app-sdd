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
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


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


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
