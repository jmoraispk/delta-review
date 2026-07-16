from pathlib import Path

import pytest

from delta_review.config import ConfigError, Target
from delta_review.security import RuntimeContext, resolve_token


def target() -> Target:
    return Target(
        host="gitlab.com",
        api_base="https://gitlab.com/api/v4",
        project="group/delta",
        mr_iid=7,
    )


def test_runtime_context_accepts_only_the_session_secret() -> None:
    context = RuntimeContext(
        target=target(),
        token="gitlab-token",
        session_secret="browser-secret",
    )
    assert context.accepts("browser-secret")
    assert not context.accepts("wrong-secret")
    assert not context.accepts(None)


def test_resolve_token_prefers_environment(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("GITLAB_TOKEN", "environment-token")

    def fail_if_called(*args: object, **kwargs: object) -> None:
        raise AssertionError("glab should not be called")

    monkeypatch.setattr("subprocess.run", fail_if_called)
    assert resolve_token("gitlab.com", tmp_path) == "environment-token"


def test_resolve_token_reports_missing_glab(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.delenv("GITLAB_TOKEN", raising=False)
    monkeypatch.setattr(
        "subprocess.run",
        lambda *args, **kwargs: (_ for _ in ()).throw(FileNotFoundError()),
    )
    with pytest.raises(ConfigError, match="glab is required"):
        resolve_token("gitlab.com", tmp_path)
