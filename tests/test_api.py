import httpx
import pytest
import respx

from delta_review.app import create_app
from delta_review.config import Target
from delta_review.security import RuntimeContext


def context() -> RuntimeContext:
    return RuntimeContext(
        target=Target(
            host="gitlab.com",
            api_base="https://gitlab.com/api/v4",
            project="group/delta",
            mr_iid=7,
        ),
        token="secret-token",
        session_secret="browser-secret",
    )


@pytest.mark.asyncio
async def test_api_rejects_missing_session_header() -> None:
    transport = httpx.ASGITransport(app=create_app(context()))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        response = await client.get("/api/config")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_api_accepts_session_header_without_exposing_token() -> None:
    transport = httpx.ASGITransport(app=create_app(context()))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/config",
            headers={"X-Delta-Session": "browser-secret"},
        )
    assert response.status_code == 200
    assert response.json() == {
        "host": "gitlab.com",
        "project": "group/delta",
        "mr_iid": 7,
    }
    assert "secret-token" not in response.text


@pytest.mark.asyncio
@respx.mock
async def test_merge_request_and_diff_routes_use_gitlab() -> None:
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
    respx.get(
        "https://gitlab.com/api/v4/projects/group%2Fdelta/merge_requests/7/diffs",
        params={"page": "1", "per_page": "100"},
    ).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "old_path": "src/parser.py",
                    "new_path": "src/parser.py",
                    "diff": "@@ -1 +1 @@",
                }
            ],
        )
    )
    transport = httpx.ASGITransport(app=create_app(context()))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        headers = {"X-Delta-Session": "browser-secret"}
        mr_response = await client.get("/api/mr", headers=headers)
        diff_response = await client.get("/api/diffs", headers=headers)
    assert mr_response.status_code == 200
    assert mr_response.json()["title"] == "Improve parser errors"
    assert diff_response.status_code == 200
    assert diff_response.json()[0]["new_path"] == "src/parser.py"


@pytest.mark.asyncio
@respx.mock
async def test_gitlab_errors_are_normalized() -> None:
    respx.get(
        "https://gitlab.com/api/v4/projects/group%2Fdelta/merge_requests/7"
    ).mock(
        return_value=httpx.Response(
            404, json={"message": "404 Project Not Found"}
        )
    )
    transport = httpx.ASGITransport(app=create_app(context()))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/mr", headers={"X-Delta-Session": "browser-secret"}
        )
    assert response.status_code == 404
    assert response.json() == {
        "code": "gitlab_error",
        "message": "404 Project Not Found",
        "status": 404,
    }


@pytest.mark.asyncio
@respx.mock
async def test_discussion_routes_create_reply_and_resolve() -> None:
    discussions_url = (
        "https://gitlab.com/api/v4/projects/group%2Fdelta/"
        "merge_requests/7/discussions"
    )
    respx.get(
        "https://gitlab.com/api/v4/projects/group%2Fdelta/"
        "merge_requests/7/versions"
    ).mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "base_commit_sha": "base",
                    "start_commit_sha": "start",
                    "head_commit_sha": "head",
                }
            ],
        )
    )
    respx.post(discussions_url).mock(
        return_value=httpx.Response(
            201,
            json={
                "id": "new-discussion",
                "notes": [{"position": {"new_line": 12}}],
            },
        )
    )
    respx.get(
        discussions_url, params={"page": "1", "per_page": "100"}
    ).mock(
        return_value=httpx.Response(
            200, json=[{"id": "existing", "notes": []}]
        )
    )
    respx.post(f"{discussions_url}/existing/notes").mock(
        return_value=httpx.Response(201, json={"id": 2, "body": "Fixed."})
    )
    respx.put(f"{discussions_url}/existing").mock(
        return_value=httpx.Response(
            200, json={"id": "existing", "resolved": True}
        )
    )
    transport = httpx.ASGITransport(app=create_app(context()))
    headers = {"X-Delta-Session": "browser-secret"}
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        list_response = await client.get("/api/discussions", headers=headers)
        create_response = await client.post(
            "/api/discussions",
            headers=headers,
            json={
                "body": "Please rename this.",
                "old_path": "a.py",
                "new_path": "a.py",
                "start_old": None,
                "start_new": 12,
                "end_old": None,
                "end_new": 12,
            },
        )
        reply_response = await client.post(
            "/api/discussions/existing/notes",
            headers=headers,
            json={"body": "Fixed."},
        )
        resolve_response = await client.put(
            "/api/discussions/existing",
            headers=headers,
            json={"resolved": True},
        )
    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == "existing"
    assert create_response.status_code == 201
    assert create_response.json()["placement"] == "inline"
    assert reply_response.status_code == 201
    assert resolve_response.status_code == 200
    assert resolve_response.json()["resolved"] is True


@pytest.mark.asyncio
async def test_comment_body_must_not_be_blank() -> None:
    transport = httpx.ASGITransport(app=create_app(context()))
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/discussions/existing/notes",
            headers={"X-Delta-Session": "browser-secret"},
            json={"body": "   "},
        )
    assert response.status_code == 422
