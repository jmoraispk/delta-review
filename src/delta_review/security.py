from __future__ import annotations

from dataclasses import dataclass
import hmac
import os
from pathlib import Path
import secrets
import subprocess

from delta_review.config import ConfigError, Target


@dataclass(frozen=True)
class RuntimeContext:
    target: Target
    token: str
    session_secret: str

    def accepts(self, candidate: str | None) -> bool:
        return candidate is not None and hmac.compare_digest(
            self.session_secret, candidate
        )


def resolve_token(host: str, cwd: Path) -> str:
    environment_token = os.environ.get("GITLAB_TOKEN")
    if environment_token:
        return environment_token

    try:
        result = subprocess.run(
            ["glab", "config", "get", "token", "--host", host],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except FileNotFoundError as error:
        raise ConfigError(
            "glab is required; install it and run glab auth login"
        ) from error
    except subprocess.CalledProcessError as error:
        raise ConfigError(f"No glab authentication found for {host}") from error

    token = result.stdout.strip()
    if not token:
        raise ConfigError(f"No glab authentication found for {host}")
    return token


def make_runtime_context(target: Target, cwd: Path) -> RuntimeContext:
    return RuntimeContext(
        target=target,
        token=resolve_token(target.host, cwd),
        session_secret=secrets.token_urlsafe(32),
    )
