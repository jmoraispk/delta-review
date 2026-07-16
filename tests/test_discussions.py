import httpx
import pytest
import respx

from delta_review.gitlab.client import GitLabClient
from delta_review.gitlab.discussions import DiscussionService
from delta_review.gitlab.positions import DiffSelection


VERSIONS_URL = (
    "https://gitlab.com/api/v4/projects/group%2Fdelta/"
    "merge_requests/7/versions"
)
DISCUSSIONS_URL = (
    "https://gitlab.com/api/v4/projects/group%2Fdelta/"
    "merge_requests/7/discussions"
)
VERSION = {
    "base_commit_sha": "base",
    "start_commit_sha": "start",
    "head_commit_sha": "head",
}
SELECTION = DiffSelection("a.py", "a.py", None, 12, None, 12)


def discussion(position: dict[str, object] | None) -> dict[str, object]:
    return {"id": "discussion-1", "notes": [{"id": 1, "position": position}]}


@pytest.mark.asyncio
@respx.mock
async def test_create_inline_fetches_fresh_version_and_verifies_position() -> None:
    versions = respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        return_value=httpx.Response(201, json=discussion({"new_line": 12}))
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, SELECTION, "Please rename this."
        )
    finally:
        await client.close()
    assert versions.call_count == 1
    assert result.placement == "inline"
    assert create.calls[0].request.read()
    assert create.calls[0].request.headers["content-type"].startswith(
        "application/json"
    )


@pytest.mark.asyncio
@respx.mock
async def test_null_position_returns_existing_general_discussion() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        return_value=httpx.Response(201, json=discussion(None))
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, SELECTION, "Please rename this."
        )
    finally:
        await client.close()
    assert result.placement == "general"
    assert create.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_position_rejection_posts_one_marked_general_fallback() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        side_effect=[
            httpx.Response(422, json={"message": "position is invalid"}),
            httpx.Response(201, json=discussion(None)),
        ]
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, SELECTION, "Please rename this."
        )
    finally:
        await client.close()
    assert result.placement == "general"
    assert create.call_count == 2
    assert "📍 a.py:12" in create.calls[1].request.content.decode()


@pytest.mark.asyncio
@respx.mock
async def test_network_failure_does_not_post_fallback() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        side_effect=httpx.ReadTimeout("timed out")
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        with pytest.raises(httpx.ReadTimeout):
            await DiscussionService(client).create_inline(
                "group/delta", 7, SELECTION, "Please rename this."
            )
    finally:
        await client.close()
    assert create.call_count == 1
