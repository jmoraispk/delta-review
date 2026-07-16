from pathlib import Path
from typing import Any

import pytest

from delta_review import cli
from delta_review.config import Target
from delta_review.security import RuntimeContext


def target() -> Target:
    return Target(
        host="gitlab.com",
        api_base="https://gitlab.com/api/v4",
        project="group/delta",
        mr_iid=7,
    )


def runtime_context() -> RuntimeContext:
    return RuntimeContext(
        target=target(),
        token="gitlab-token",
        session_secret="browser-secret",
    )


def test_run_server_binds_loopback_and_opens_browser(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    opened: list[str] = []
    server: dict[str, Any] = {}
    monkeypatch.setattr(cli, "make_runtime_context", lambda target, cwd: runtime_context())
    monkeypatch.setattr(cli, "_available_port", lambda: 43210)
    monkeypatch.setattr(cli.webbrowser, "open", opened.append)
    monkeypatch.setattr(
        cli.uvicorn,
        "run",
        lambda app, **kwargs: server.update(app=app, **kwargs),
    )

    cli.run_server(target(), cwd=tmp_path, no_open=False)

    assert opened == ["http://127.0.0.1:43210/#session=browser-secret"]
    assert server["host"] == "127.0.0.1"
    assert server["port"] == 43210
    assert "browser-secret" not in capsys.readouterr().out


def test_no_open_prints_the_session_url(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(cli, "make_runtime_context", lambda target, cwd: runtime_context())
    monkeypatch.setattr(cli, "_available_port", lambda: 43210)
    monkeypatch.setattr(
        cli.webbrowser,
        "open",
        lambda url: (_ for _ in ()).throw(AssertionError("browser should not open")),
    )
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: None)

    cli.run_server(target(), cwd=tmp_path, no_open=True)

    assert capsys.readouterr().out.strip() == (
        "http://127.0.0.1:43210/#session=browser-secret"
    )
