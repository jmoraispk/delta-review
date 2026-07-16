from pathlib import Path
from collections.abc import Callable
from typing import Any

import pytest

from delta_review import cli
from delta_review.config import ConfigError, Target
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

    class Listener:
        def __enter__(self) -> "Listener":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def getsockname(self) -> tuple[str, int]:
            return ("127.0.0.1", 43210)

    monkeypatch.setattr(cli, "make_runtime_context", lambda target, cwd: runtime_context())
    monkeypatch.setattr(cli, "_reserve_listener", Listener)
    monkeypatch.setattr(cli.webbrowser, "open", opened.append)

    def run_uvicorn(
        app: object,
        listener: object,
        host: str,
        port: int,
        on_started: Callable[[], None] | None,
    ) -> None:
        assert opened == []
        assert callable(on_started)
        on_started()
        server.update(
            app=app,
            listener=listener,
            host=host,
            port=port,
        )

    monkeypatch.setattr(cli, "_run_uvicorn", run_uvicorn)

    cli.run_server(target(), cwd=tmp_path, no_open=False)

    assert opened == ["http://127.0.0.1:43210/#session=browser-secret"]
    assert server["host"] == "127.0.0.1"
    assert server["port"] == 43210
    assert server["listener"].getsockname()[1] == 43210
    assert "browser-secret" not in capsys.readouterr().out


def test_no_open_prints_the_session_url(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    class Listener:
        def __enter__(self) -> "Listener":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def getsockname(self) -> tuple[str, int]:
            return ("127.0.0.1", 43210)

    monkeypatch.setattr(cli, "make_runtime_context", lambda target, cwd: runtime_context())
    monkeypatch.setattr(cli, "_reserve_listener", Listener)
    monkeypatch.setattr(
        cli.webbrowser,
        "open",
        lambda url: (_ for _ in ()).throw(AssertionError("browser should not open")),
    )
    monkeypatch.setattr(
        cli,
        "_run_uvicorn",
        lambda app, listener, host, port, on_started: (
            None
            if on_started is None
            else (_ for _ in ()).throw(
                AssertionError("no browser callback expected")
            )
        ),
    )

    cli.run_server(target(), cwd=tmp_path, no_open=True)

    assert capsys.readouterr().out.strip() == (
        "http://127.0.0.1:43210/#session=browser-secret"
    )


def test_run_server_rejects_non_loopback_binding(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="loopback"):
        cli.run_server(
            target(),
            cwd=tmp_path,
            no_open=True,
            bind_host="0.0.0.0",
        )
