from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import json
import re
import subprocess
from urllib.parse import urlparse


class ConfigError(RuntimeError):
    pass


@dataclass(frozen=True)
class Target:
    host: str
    api_base: str
    project: str
    mr_iid: int


_MR_PATH = re.compile(r"^/(?P<project>.+)/-/merge_requests/(?P<iid>\d+)/?$")
_SCP_REMOTE = re.compile(r"^(?:[^@]+@)?(?P<host>[^:]+):(?P<path>.+)$")


def parse_mr_url(value: str) -> Target:
    parsed = urlparse(value)
    match = _MR_PATH.match(parsed.path)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or not match:
        raise ConfigError(f"Not a GitLab merge request URL: {value}")
    project = match.group("project").removesuffix(".git")
    return Target(
        host=parsed.hostname,
        api_base=f"{parsed.scheme}://{parsed.netloc}/api/v4",
        project=project,
        mr_iid=int(match.group("iid")),
    )


def parse_remote_url(value: str) -> tuple[str, str]:
    scp = _SCP_REMOTE.match(value)
    if scp and "://" not in value:
        return scp.group("host"), scp.group("path").removesuffix(".git")
    parsed = urlparse(value)
    if not parsed.hostname or not parsed.path.strip("/"):
        raise ConfigError(f"Cannot parse Git remote: {value}")
    return parsed.hostname, parsed.path.strip("/").removesuffix(".git")


def _run(command: list[str], cwd: Path) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except FileNotFoundError as error:
        raise ConfigError(f"Required command not found: {command[0]}") from error
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or error.stdout.strip() or "command failed"
        raise ConfigError(message) from error
    return result.stdout.strip()


def resolve_target(
    *,
    mr_url: str | None,
    host: str | None,
    project: str | None,
    mr_iid: int | None,
    cwd: Path,
) -> Target:
    url_api_base: str | None = None
    if mr_url:
        parsed = parse_mr_url(mr_url)
        final_host = host or parsed.host
        final_project = project or parsed.project
        mr_iid = mr_iid or parsed.mr_iid
        if host is None:
            url_api_base = parsed.api_base
    else:
        detected_host: str | None = None
        detected_project: str | None = None
        if host is None or project is None:
            remote = _run(["git", "remote", "get-url", "origin"], cwd)
            detected_host, detected_project = parse_remote_url(remote)
        final_host = host or detected_host
        final_project = project or detected_project

    if not final_host or not final_project:
        raise ConfigError("GitLab host and project could not be resolved")

    if mr_iid is None:
        payload = json.loads(_run(["glab", "mr", "view", "--output", "json"], cwd))
        mr_iid = int(payload["iid"])

    if url_api_base:
        api_base = url_api_base
    else:
        api_host = _run(
            ["glab", "config", "get", "api_host", "--host", final_host], cwd
        )
        api_protocol = _run(
            ["glab", "config", "get", "api_protocol", "--host", final_host], cwd
        )
        api_base = f"{api_protocol or 'https'}://{api_host or final_host}/api/v4"
    return Target(
        host=final_host,
        api_base=api_base,
        project=final_project,
        mr_iid=mr_iid,
    )
