from __future__ import annotations

import argparse
from pathlib import Path
import socket
import webbrowser

import uvicorn

from delta_review.app import create_app
from delta_review.config import ConfigError, Target, resolve_target
from delta_review.security import make_runtime_context


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="delta")
    parser.add_argument("mr_url", nargs="?")
    parser.add_argument("--host")
    parser.add_argument("--project")
    parser.add_argument("--mr", type=int, dest="mr_iid")
    parser.add_argument("--no-open", action="store_true")
    return parser


def _available_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


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
    port = _available_port()
    url = f"http://{bind_host}:{port}/#session={context.session_secret}"
    if no_open:
        print(url)
    else:
        webbrowser.open(url)
    uvicorn.run(app, host=bind_host, port=port)


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
