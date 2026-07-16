from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from delta_review.gitlab.client import GitLabClient, GitLabError
from delta_review.gitlab.diffs import DiffService
from delta_review.models import DiffFile, MergeRequest
from delta_review.security import RuntimeContext


def create_app(
    context: RuntimeContext, gitlab_client: GitLabClient | None = None
) -> FastAPI:
    client = gitlab_client or GitLabClient(
        context.target.api_base, context.token
    )
    owns_client = gitlab_client is None
    diff_service = DiffService(client)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        if owns_client:
            await client.close()

    app = FastAPI(
        title="Delta",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )

    def require_session(
        x_delta_session: str | None = Header(default=None),
    ) -> None:
        if not context.accepts(x_delta_session):
            raise HTTPException(status_code=401, detail="Invalid Delta session")

    @app.get("/api/config", dependencies=[Depends(require_session)])
    async def get_config() -> dict[str, str | int]:
        target = context.target
        return {
            "host": target.host,
            "project": target.project,
            "mr_iid": target.mr_iid,
        }

    @app.get(
        "/api/mr",
        dependencies=[Depends(require_session)],
        response_model=MergeRequest,
    )
    async def get_merge_request() -> MergeRequest:
        target = context.target
        return await diff_service.get_merge_request(
            target.project, target.mr_iid
        )

    @app.get(
        "/api/diffs",
        dependencies=[Depends(require_session)],
        response_model=list[DiffFile],
    )
    async def get_diffs() -> list[DiffFile]:
        target = context.target
        return await diff_service.get_diffs(target.project, target.mr_iid)

    @app.exception_handler(GitLabError)
    async def handle_gitlab_error(
        request: Request, error: GitLabError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={
                "code": "gitlab_error",
                "message": str(error),
                "status": error.status_code,
            },
        )

    app.state.context = context
    app.state.require_session = require_session
    app.state.gitlab_client = client
    app.state.diff_service = diff_service
    return app
