from __future__ import annotations

import argparse
from pathlib import Path

from delta_review.config import resolve_target


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="delta")
    parser.add_argument("mr_url", nargs="?")
    parser.add_argument("--host")
    parser.add_argument("--project")
    parser.add_argument("--mr", type=int, dest="mr_iid")
    parser.add_argument("--no-open", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    target = resolve_target(
        mr_url=args.mr_url,
        host=args.host,
        project=args.project,
        mr_iid=args.mr_iid,
        cwd=Path.cwd(),
    )
    print(f"Resolved {target.host}/{target.project}!{target.mr_iid}")
