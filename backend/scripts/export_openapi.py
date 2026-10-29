"""Emit the OpenAPI schema without starting a server.

The frontend client is generated from this output, so generation must work in
CI where no server is running. Importing the app and calling ``app.openapi()``
is enough — and keeps the emitted schema the single source of truth, rather
than a hand-written document the server is then expected to match.

Usage:
    python scripts/export_openapi.py --out openapi.json
    python scripts/export_openapi.py            # writes to stdout
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make src/ importable when run directly from backend/ without an install.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from taskflow.main import app  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Emit the OpenAPI schema.")
    parser.add_argument("--out", type=Path, default=None, help="destination file")
    args = parser.parse_args()

    # sort_keys keeps the output byte-stable so the CI drift check only fires
    # on a real schema change, not on dictionary ordering.
    schema = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"

    if args.out is None:
        sys.stdout.write(schema)
    else:
        args.out.write_text(schema, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
