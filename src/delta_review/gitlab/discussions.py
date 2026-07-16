from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import quote

from delta_review.gitlab.client import GitLabClient, GitLabError
from delta_review.gitlab.positions import (
    DiffSelection,
    Version,
    build_position,
)


@dataclass(frozen=True)
class PostingResult:
    placement: Literal["inline", "general"]
    discussion: dict[str, Any]


class DiscussionService:
    def __init__(self, client: GitLabClient) -> None:
        self._client = client

    @staticmethod
    def _merge_request_path(project: str, mr_iid: int) -> str:
        encoded_project = quote(project, safe="")
        return f"/projects/{encoded_project}/merge_requests/{mr_iid}"

    async def _current_version(self, project: str, mr_iid: int) -> Version:
        path = self._merge_request_path(project, mr_iid)
        versions = await self._client.request("GET", f"{path}/versions")
        if not versions:
            raise GitLabError(409, "The merge request has no diff version")
        current = versions[0]
        return Version(
            base_sha=current["base_commit_sha"],
            start_sha=current["start_commit_sha"],
            head_sha=current["head_commit_sha"],
        )

    @staticmethod
    def _fallback_body(selection: DiffSelection, body: str) -> str:
        start = selection.start_new
        if start is None:
            start = selection.start_old
        end = selection.end_new
        if end is None:
            end = selection.end_old
        marker = f"📍 {selection.new_path or selection.old_path}:{start}"
        if end != start:
            marker += f"-{end}"
        return f"{marker}\n\n{body}"

    @staticmethod
    def _placement(
        discussion: dict[str, Any],
    ) -> Literal["inline", "general"]:
        notes = discussion.get("notes") or []
        note_position = notes[0].get("position") if notes else None
        return "inline" if note_position is not None else "general"

    @staticmethod
    def _last_line(selection: DiffSelection) -> DiffSelection:
        return DiffSelection(
            old_path=selection.old_path,
            new_path=selection.new_path,
            start_old=selection.end_old,
            start_new=selection.end_new,
            end_old=selection.end_old,
            end_new=selection.end_new,
        )

    async def create_inline(
        self,
        project: str,
        mr_iid: int,
        selection: DiffSelection,
        body: str,
    ) -> PostingResult:
        path = self._merge_request_path(project, mr_iid)
        discussions_path = f"{path}/discussions"
        version = await self._current_version(project, mr_iid)
        position = build_position(selection, version)

        try:
            discussion = await self._client.request(
                "POST",
                discussions_path,
                json={"body": body, "position": position},
            )
        except GitLabError as error:
            if error.status_code not in {400, 422}:
                raise
            is_multiline = (
                selection.start_old,
                selection.start_new,
            ) != (selection.end_old, selection.end_new)
            if is_multiline:
                last_line = self._last_line(selection)
                try:
                    discussion = await self._client.request(
                        "POST",
                        discussions_path,
                        json={
                            "body": body,
                            "position": build_position(last_line, version),
                        },
                    )
                except GitLabError as retry_error:
                    if retry_error.status_code not in {400, 422}:
                        raise
                else:
                    return PostingResult(
                        self._placement(discussion), discussion
                    )
            discussion = await self._client.request(
                "POST",
                discussions_path,
                json={"body": self._fallback_body(selection, body)},
            )
            return PostingResult("general", discussion)

        return PostingResult(self._placement(discussion), discussion)

    async def get_discussions(
        self, project: str, mr_iid: int
    ) -> list[dict[str, Any]]:
        path = self._merge_request_path(project, mr_iid)
        return [
            discussion
            async for discussion in self._client.paginate(
                f"{path}/discussions"
            )
        ]

    async def reply(
        self,
        project: str,
        mr_iid: int,
        discussion_id: str,
        body: str,
    ) -> dict[str, Any]:
        if not discussion_id.strip():
            raise ValueError("discussion_id must not be empty")
        path = self._merge_request_path(project, mr_iid)
        encoded_id = quote(discussion_id, safe="")
        return await self._client.request(
            "POST",
            f"{path}/discussions/{encoded_id}/notes",
            json={"body": body},
        )

    async def set_resolved(
        self,
        project: str,
        mr_iid: int,
        discussion_id: str,
        resolved: bool,
    ) -> dict[str, Any]:
        if not discussion_id.strip():
            raise ValueError("discussion_id must not be empty")
        path = self._merge_request_path(project, mr_iid)
        encoded_id = quote(discussion_id, safe="")
        return await self._client.request(
            "PUT",
            f"{path}/discussions/{encoded_id}",
            json={"resolved": resolved},
        )
