"""Generate cross-language test fixtures from the Python implementation."""

from __future__ import annotations

import json
from pathlib import Path

from delta_review.gitlab.positions import (
    DiffSelection,
    Version,
    build_legacy_position,
    build_position,
)

VERSION = Version(base_sha="base", start_sha="start", head_sha="head")

CASES: list[tuple[str, DiffSelection]] = [
    ("added single line", DiffSelection("a.py", "a.py", None, 12, None, 12)),
    ("removed single line", DiffSelection("a.py", "a.py", 9, None, 9, None)),
    ("context single line", DiffSelection("a.py", "a.py", 12, 14, 12, 14)),
    ("context multiline", DiffSelection("a.py", "a.py", 10, 10, 11, 11)),
    ("context multiline offset", DiffSelection("a.py", "a.py", 10, 12, 11, 13)),
    ("added multiline", DiffSelection("a.py", "a.py", None, 12, None, 14)),
    ("removed multiline", DiffSelection("a.py", "a.py", 3, None, 7, None)),
    ("renamed file", DiffSelection("old.py", "new.py", None, 1, None, 2)),
]


def main() -> None:
    payload = {
        "version": {
            "base_sha": VERSION.base_sha,
            "start_sha": VERSION.start_sha,
            "head_sha": VERSION.head_sha,
        },
        "cases": [
            {
                "name": name,
                "selection": {
                    "old_path": selection.old_path,
                    "new_path": selection.new_path,
                    "start_old": selection.start_old,
                    "start_new": selection.start_new,
                    "end_old": selection.end_old,
                    "end_new": selection.end_new,
                },
                "standard": build_position(selection, VERSION),
                "legacy": build_legacy_position(selection, VERSION),
            }
            for name, selection in CASES
        ],
    }
    destination = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "positions.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
