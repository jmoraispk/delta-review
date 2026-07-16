import httpx
import pytest
import respx

from delta_review.gitlab.client import GitLabClient, GitLabError


@pytest.mark.asyncio
@respx.mock
async def test_request_adds_private_token() -> None:
    route = respx.get("https://gitlab.com/api/v4/user").mock(
        return_value=httpx.Response(200, json={"id": 1})
    )
    client = GitLabClient("https://gitlab.com/api/v4", "secret-token")
    try:
        assert await client.request("GET", "/user") == {"id": 1}
    finally:
        await client.close()
    assert route.calls[0].request.headers["PRIVATE-TOKEN"] == "secret-token"


@pytest.mark.asyncio
@respx.mock
async def test_request_raises_normalized_gitlab_error() -> None:
    respx.get("https://gitlab.com/api/v4/missing").mock(
        return_value=httpx.Response(404, json={"message": "404 Project Not Found"})
    )
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        with pytest.raises(GitLabError) as error:
            await client.request("GET", "/missing")
    finally:
        await client.close()
    assert error.value.status_code == 404
    assert str(error.value) == "404 Project Not Found"


@pytest.mark.asyncio
@respx.mock
async def test_paginate_follows_gitlab_next_page_header() -> None:
    first = respx.get(
        "https://gitlab.com/api/v4/items",
        params={"page": "1", "per_page": "100"},
    ).mock(
        return_value=httpx.Response(
            200, json=[{"id": 1}], headers={"x-next-page": "2"}
        )
    )
    second = respx.get(
        "https://gitlab.com/api/v4/items",
        params={"page": "2", "per_page": "100"},
    ).mock(return_value=httpx.Response(200, json=[{"id": 2}]))
    client = GitLabClient("https://gitlab.com/api/v4", "token")
    try:
        items = [item async for item in client.paginate("/items")]
    finally:
        await client.close()
    assert items == [{"id": 1}, {"id": 2}]
    assert first.called and second.called
