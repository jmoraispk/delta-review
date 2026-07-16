import httpx
import pytest
import respx

from delta_review.gitlab.client import GitLabClient
from delta_review.gitlab.diffs import DiffService


@pytest.mark.asyncio
@respx.mock
async def test_prefers_paginated_diffs() -> None:
    route = respx.get(
        "https://gitlab.com/api/v4/projects/group%2Fdelta/merge_requests/7/diffs",
        params={"page": "1", "per_page": "100"},
    ).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "old_path": "a.py",
                    "new_path": "a.py",
                    "diff": "@@ -1 +1 @@\n-a\n+b",
                    "new_file": False,
                    "renamed_file": False,
                    "deleted_file": False,
                    "collapsed": False,
                    "too_large": False,
                }
            ],
        )
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        files = await DiffService(client).get_diffs("group/delta", 7)
    finally:
        await client.close()
    assert route.called
    assert files[0].new_path == "a.py"


@pytest.mark.asyncio
@respx.mock
async def test_falls_back_to_changes_when_diffs_is_unsupported() -> None:
    respx.get(
        "https://old.example/api/v4/projects/group%2Fdelta/merge_requests/7/diffs",
        params={"page": "1", "per_page": "100"},
    ).mock(return_value=httpx.Response(404, json={"message": "Not Found"}))
    changes = respx.get(
        "https://old.example/api/v4/projects/group%2Fdelta/merge_requests/7/changes"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "changes": [
                    {
                        "old_path": "a.py",
                        "new_path": "a.py",
                        "diff": "@@ -1 +1 @@",
                    }
                ]
            },
        )
    )
    client = GitLabClient("https://old.example/api/v4", "token")
    try:
        files = await DiffService(client).get_diffs("group/delta", 7)
    finally:
        await client.close()
    assert changes.called
    assert files[0].old_path == "a.py"


@pytest.mark.asyncio
@respx.mock
async def test_retries_truncated_changes_with_raw_diffs() -> None:
    base = (
        "https://old.example/api/v4/projects/group%2Fdelta/"
        "merge_requests/7"
    )
    respx.get(
        f"{base}/diffs",
        params={"page": "1", "per_page": "100"},
    ).mock(return_value=httpx.Response(404, json={"message": "Not Found"}))
    changes = respx.get(f"{base}/changes").mock(
        side_effect=[
            httpx.Response(200, json={"overflow": True, "changes": []}),
            httpx.Response(
                200,
                json={
                    "overflow": False,
                    "changes": [
                        {
                            "old_path": "complete.py",
                            "new_path": "complete.py",
                            "diff": "@@ -1 +1 @@",
                        }
                    ],
                },
            ),
        ]
    )
    client = GitLabClient("https://old.example/api/v4", "token")
    try:
        files = await DiffService(client).get_diffs("group/delta", 7)
    finally:
        await client.close()
    assert changes.call_count == 2
    assert changes.calls[1].request.url.params["access_raw_diffs"] == "true"
    assert files[0].new_path == "complete.py"


@pytest.mark.asyncio
@respx.mock
async def test_get_merge_request_returns_typed_metadata() -> None:
    respx.get(
        "https://gitlab.com/api/v4/projects/group%2Fdelta/merge_requests/7"
    ).mock(
        return_value=httpx.Response(
            200,
            json={
                "iid": 7,
                "title": "Improve parser errors",
                "web_url": "https://gitlab.com/group/delta/-/merge_requests/7",
                "state": "opened",
                "source_branch": "parser-errors",
                "target_branch": "main",
            },
        )
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        merge_request = await DiffService(client).get_merge_request(
            "group/delta", 7
        )
    finally:
        await client.close()
    assert merge_request.title == "Improve parser errors"
