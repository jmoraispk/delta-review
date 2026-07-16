from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx


class GitLabError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code


class GitLabClient:
    def __init__(self, api_base: str, token: str) -> None:
        self._client = httpx.AsyncClient(
            base_url=api_base.rstrip("/"),
            headers={"PRIVATE-TOKEN": token},
            timeout=httpx.Timeout(30, connect=10),
        )

    @staticmethod
    def _raise_for_error(response: httpx.Response) -> None:
        if not response.is_error:
            return
        try:
            payload = response.json()
        except ValueError:
            message = response.text
        else:
            message = (
                payload.get("message", response.text)
                if isinstance(payload, dict)
                else str(payload)
            )
        raise GitLabError(response.status_code, str(message))

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._client.request(method, path, **kwargs)
        self._raise_for_error(response)
        return response.json()

    async def paginate(self, path: str) -> AsyncIterator[dict[str, Any]]:
        page = 1
        while True:
            response = await self._client.get(
                path, params={"page": page, "per_page": 100}
            )
            self._raise_for_error(response)
            values = response.json()
            for value in values:
                yield value
            next_page = response.headers.get("x-next-page")
            if not next_page:
                break
            page = int(next_page)

    async def close(self) -> None:
        await self._client.aclose()
