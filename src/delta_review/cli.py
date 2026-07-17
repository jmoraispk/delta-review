from __future__ import annotations

import argparse
from collections.abc import Callable
from pathlib import Path
import socket
import threading
import time
from typing import Any
import webbrowser

import uvicorn

from delta_review.app import create_app
from delta_review.config import ConfigError, Target, resolve_target
from delta_review.security import make_runtime_context


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="delta-review")
    parser.add_argument("mr_url", nargs="?")
    parser.add_argument("--host")
    parser.add_argument("--project")
    parser.add_argument("--mr", type=int, dest="mr_iid")
    parser.add_argument("--no-open", action="store_true")
    return parser


def _reserve_listener() -> socket.socket:
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    return listener


def _run_uvicorn(
    app: Any,
    listener: socket.socket,
    host: str,
    port: int,
    on_started: Callable[[], None] | None,
) -> None:
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port))

    if on_started is not None:
        def notify_when_started() -> None:
            while not server.started and not server.should_exit:
                time.sleep(0.01)
            if server.started:
                on_started()

        threading.Thread(
            target=notify_when_started,
            name="delta-browser-opener",
            daemon=True,
        ).start()

    server.run(sockets=[listener])


def run_server(
    target: Target,
    *,
    cwd: Path,
    no_open: bool,
    bind_host: str = "127.0.0.1",
) -> None:
    if bind_host != "127.0.0.1":
        raise ConfigError("Delta must bind to the 127.0.0.1 loopback address")
    context = make_runtime_context(target, cwd)
    app = create_app(context)
    with _reserve_listener() as listener:
        port = int(listener.getsockname()[1])
        url = f"http://{bind_host}:{port}/#session={context.session_secret}"
        on_started: Callable[[], None] | None
        if no_open:
            print(url)
            on_started = None
        else:
            on_started = lambda: webbrowser.open(url)
        _run_uvicorn(app, listener, bind_host, port, on_started)


def main() -> None:
    args = build_parser().parse_args()
    target = resolve_target(
        mr_url=args.mr_url,
        host=args.host,
        project=args.project,
        mr_iid=args.mr_iid,
        cwd=Path.cwd(),
    )
    run_server(target, cwd=Path.cwd(), no_open=args.no_open)
