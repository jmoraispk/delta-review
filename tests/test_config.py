from pathlib import Path

import pytest

from delta_review import config
from delta_review.config import ConfigError, parse_mr_url, parse_remote_url


def test_parse_gitlab_mr_url() -> None:
    target = parse_mr_url(
        "https://gitlab.example.com/platform/tools/delta/-/merge_requests/42"
    )
    assert target.host == "gitlab.example.com"
    assert target.project == "platform/tools/delta"
    assert target.mr_iid == 42


@pytest.mark.parametrize(
    ("remote", "host", "project"),
    [
        ("git@gitlab.com:group/delta.git", "gitlab.com", "group/delta"),
        (
            "ssh://git@gitlab.example.com/group/sub/delta.git",
            "gitlab.example.com",
            "group/sub/delta",
        ),
        (
            "https://gitlab.example.com/group/delta.git",
            "gitlab.example.com",
            "group/delta",
        ),
    ],
)
def test_parse_remote_url(remote: str, host: str, project: str) -> None:
    parsed = parse_remote_url(remote)
    assert parsed == (host, project)


def test_reject_non_gitlab_style_mr_url() -> None:
    with pytest.raises(ConfigError, match="merge request URL"):
        parse_mr_url("https://example.com/not-an-mr")


def test_explicit_target_does_not_require_a_git_repository(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[list[str]] = []

    def fake_run(command: list[str], cwd: Path) -> str:
        calls.append(command)
        return ""

    monkeypatch.setattr(config, "_run", fake_run)
    target = config.resolve_target(
        mr_url=None,
        host="gitlab.example.com",
        project="group/delta",
        mr_iid=7,
        cwd=tmp_path,
    )
    assert target.project == "group/delta"
    assert all(command[0] != "git" for command in calls)


def test_explicit_values_override_mr_url(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(config, "_run", lambda command, cwd: "")
    target = config.resolve_target(
        mr_url="https://gitlab.com/old/project/-/merge_requests/1",
        host="gitlab.example.com",
        project="new/project",
        mr_iid=9,
        cwd=tmp_path,
    )
    assert (target.host, target.project, target.mr_iid) == (
        "gitlab.example.com",
        "new/project",
        9,
    )
