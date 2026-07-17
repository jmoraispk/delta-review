import httpx
import pytest
import respx

from delta_review.gitlab.client import GitLabClient, GitLabError
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
MULTILINE_SELECTION = DiffSelection("a.py", "a.py", None, 12, None, 14)


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
    assert result.fallback == "none"
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
    assert result.fallback == "general"
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
    assert result.fallback == "general"
    assert create.call_count == 2
    assert "📍 a.py:12" in create.calls[1].request.content.decode()


@pytest.mark.asyncio
@respx.mock
async def test_multiline_rejection_retries_legacy_range() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        side_effect=[
            httpx.Response(422, json={"message": "invalid range"}),
            httpx.Response(
                201,
                json=discussion(
                    {
                        "new_line": 14,
                        "line_range": {
                            "start": {"new_line": 12, "type": "new"},
                            "end": {"new_line": 14, "type": "new"},
                        },
                    }
                ),
            ),
        ]
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, MULTILINE_SELECTION, "Review this range."
        )
    finally:
        await client.close()

    assert result.placement == "inline"
    assert result.fallback == "none"
    assert create.call_count == 2
    assert b'"new_line":"14"' in create.calls[1].request.content
    assert b'"line_range"' in create.calls[1].request.content


@pytest.mark.asyncio
@respx.mock
async def test_multiline_rejection_retries_final_line_after_legacy_range() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        side_effect=[
            httpx.Response(422, json={"message": "invalid range"}),
            httpx.Response(422, json={"message": "invalid legacy range"}),
            httpx.Response(201, json=discussion({"new_line": 14})),
        ]
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, MULTILINE_SELECTION, "Review this range."
        )
    finally:
        await client.close()

    assert result.placement == "inline"
    assert result.fallback == "final_line"
    assert create.call_count == 3
    assert b'"new_line":14' in create.calls[2].request.content
    assert b'"line_range"' not in create.calls[2].request.content


@pytest.mark.asyncio
@respx.mock
async def test_multiline_rejection_falls_back_to_general_after_all_retries() -> None:
    respx.get(VERSIONS_URL).mock(
        return_value=httpx.Response(200, json=[VERSION])
    )
    create = respx.post(DISCUSSIONS_URL).mock(
        side_effect=[
            httpx.Response(422, json={"message": "invalid range"}),
            httpx.Response(422, json={"message": "invalid legacy range"}),
            httpx.Response(422, json={"message": "invalid final line"}),
            httpx.Response(201, json=discussion(None)),
        ]
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        result = await DiscussionService(client).create_inline(
            "group/delta", 7, MULTILINE_SELECTION, "Review this range."
        )
    finally:
        await client.close()

    assert result.placement == "general"
    assert result.fallback == "general"
    assert create.call_count == 4


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
        with pytest.raises(GitLabError) as captured:
            await DiscussionService(client).create_inline(
                "group/delta", 7, SELECTION, "Please rename this."
            )
    finally:
        await client.close()
    assert captured.value.code == "gitlab_timeout"
    assert create.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_reads_replies_and_resolves_discussions() -> None:
    list_route = respx.get(
        DISCUSSIONS_URL, params={"page": "1", "per_page": "100"}
    ).mock(
        return_value=httpx.Response(
            200, json=[{"id": "discussion-1", "notes": []}]
        )
    )
    reply_route = respx.post(f"{DISCUSSIONS_URL}/discussion-1/notes").mock(
        return_value=httpx.Response(
            201, json={"id": 2, "body": "Fixed now."}
        )
    )
    resolve_route = respx.put(f"{DISCUSSIONS_URL}/discussion-1").mock(
        return_value=httpx.Response(
            200, json={"id": "discussion-1", "resolved": True}
        )
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    service = DiscussionService(client)
    try:
        discussions = await service.get_discussions("group/delta", 7)
        reply = await service.reply(
            "group/delta", 7, "discussion-1", "Fixed now."
        )
        resolved = await service.set_resolved(
            "group/delta", 7, "discussion-1", True
        )
    finally:
        await client.close()
    assert discussions[0]["id"] == "discussion-1"
    assert reply["body"] == "Fixed now."
    assert resolved["resolved"] is True
    assert list_route.called and reply_route.called and resolve_route.called
