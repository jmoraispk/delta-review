from __future__ import annotations

from urllib.parse import quote

from delta_review.gitlab.client import GitLabClient, GitLabError
from delta_review.models import DiffFile, MergeRequest


class DiffService:
    def __init__(self, client: GitLabClient) -> None:
        self._client = client

    @staticmethod
    def _merge_request_path(project: str, mr_iid: int) -> str:
        encoded_project = quote(project, safe="")
        return f"/projects/{encoded_project}/merge_requests/{mr_iid}"

    async def get_merge_request(
        self, project: str, mr_iid: int
    ) -> MergeRequest:
        payload = await self._client.request(
            "GET", self._merge_request_path(project, mr_iid)
        )
        return MergeRequest.model_validate(payload)

    async def get_diffs(self, project: str, mr_iid: int) -> list[DiffFile]:
        merge_request_path = self._merge_request_path(project, mr_iid)
        try:
            raw_files = [
                item
                async for item in self._client.paginate(
                    f"{merge_request_path}/diffs"
                )
            ]
        except GitLabError as error:
            if error.status_code not in {404, 500}:
                raise
            payload = await self._client.request(
                "GET", f"{merge_request_path}/changes"
            )
            if payload.get("overflow"):
                payload = await self._client.request(
                    "GET",
                    f"{merge_request_path}/changes",
                    params={"access_raw_diffs": "true"},
                )
                if payload.get("overflow"):
                    raise GitLabError(
                        422,
                        "GitLab returned a truncated merge request diff",
                        "diff_truncated",
                    )
            raw_files = payload.get("changes", [])
        return [DiffFile.model_validate(file) for file in raw_files]
