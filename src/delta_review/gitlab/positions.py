from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1
from typing import Any


@dataclass(frozen=True)
class Version:
    base_sha: str
    start_sha: str
    head_sha: str


@dataclass(frozen=True)
class DiffSelection:
    old_path: str
    new_path: str
    start_old: int | None
    start_new: int | None
    end_old: int | None
    end_new: int | None


def _line_code(path: str, old: int | None, new: int | None) -> str:
    digest = sha1(path.encode()).hexdigest()
    return f"{digest}_{old or 0}_{new or 0}"


def _line_type(old: int | None, new: int | None) -> str:
    return "new" if new is not None and old is None else "old"


def _range_endpoint(
    path: str, old: int | None, new: int | None
) -> dict[str, str | int]:
    endpoint: dict[str, str | int] = {
        "line_code": _line_code(path, old, new),
        "type": _line_type(old, new),
    }
    if old is not None:
        endpoint["old_line"] = old
    if new is not None:
        endpoint["new_line"] = new
    return endpoint


def build_position(
    selection: DiffSelection, version: Version
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "position_type": "text",
        "base_sha": version.base_sha,
        "start_sha": version.start_sha,
        "head_sha": version.head_sha,
        "old_path": selection.old_path,
        "new_path": selection.new_path,
    }
    if selection.end_old is not None:
        payload["old_line"] = selection.end_old
    if selection.end_new is not None:
        payload["new_line"] = selection.end_new

    if (selection.start_old, selection.start_new) != (
        selection.end_old,
        selection.end_new,
    ):
        path = selection.new_path or selection.old_path
        payload["line_range"] = {
            "start": _range_endpoint(
                path, selection.start_old, selection.start_new
            ),
            "end": _range_endpoint(
                path, selection.end_old, selection.end_new
            ),
        }
    return payload
