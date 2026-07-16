from hashlib import sha1

from delta_review.gitlab.positions import DiffSelection, Version, build_position


VERSION = Version(base_sha="base", start_sha="start", head_sha="head")


def test_added_line_uses_new_line_only() -> None:
    payload = build_position(
        DiffSelection(
            old_path="a.py",
            new_path="a.py",
            start_old=None,
            start_new=12,
            end_old=None,
            end_new=12,
        ),
        VERSION,
    )
    assert payload["new_line"] == 12
    assert "old_line" not in payload


def test_removed_line_uses_old_line_only() -> None:
    payload = build_position(
        DiffSelection("a.py", "a.py", 9, None, 9, None), VERSION
    )
    assert payload["old_line"] == 9
    assert "new_line" not in payload


def test_context_line_uses_both_coordinates() -> None:
    payload = build_position(
        DiffSelection("a.py", "a.py", 12, 14, 12, 14), VERSION
    )
    assert payload["old_line"] == 12
    assert payload["new_line"] == 14


def test_multiline_position_contains_gitlab_line_codes() -> None:
    payload = build_position(
        DiffSelection("a.py", "a.py", 10, 10, 11, 11), VERSION
    )
    path_hash = sha1(b"a.py").hexdigest()
    assert payload["line_range"]["start"] == {
        "line_code": f"{path_hash}_10_10",
        "type": "old",
        "old_line": 10,
        "new_line": 10,
    }
    assert payload["line_range"]["end"] == {
        "line_code": f"{path_hash}_11_11",
        "type": "old",
        "old_line": 11,
        "new_line": 11,
    }
