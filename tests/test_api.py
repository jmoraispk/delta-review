import httpx
import pytest

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
