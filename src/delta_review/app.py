from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import ipaddress
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from delta_review.gitlab.client import GitLabClient, GitLabError
from delta_review.gitlab.diffs import DiffService
from delta_review.gitlab.discussions import DiscussionService
from delta_review.gitlab.positions import DiffSelection
from delta_review.models import (
    DiffFile,
    InlineCommentRequest,
    MergeRequest,
    NoteRequest,
    ResolutionRequest,
)
from delta_review.security import RuntimeContext


def _is_loopback_authority(authority: str) -> bool:
    hostname = urlsplit(f"//{authority}").hostname
    if hostname is None:
        return False
    if hostname.casefold() == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _secure_response(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "base-uri 'none'; "
        "connect-src 'self'; "
        "font-src 'self'; "
        "frame-ancestors 'none'; "
        "img-src 'self' data:; "
        "object-src 'none'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "worker-src 'self' blob:"
    )
    return response


def create_app(
    context: RuntimeContext, gitlab_client: GitLabClient | None = None
) -> FastAPI:
    client = gitlab_client or GitLabClient(
        context.target.api_base, context.token
    )
    owns_client = gitlab_client is None
    diff_service = DiffService(client)
    discussion_service = DiscussionService(client)

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
    static_dir = Path(__file__).parent / "static"
    required_assets = [
        static_dir / "index.html",
        static_dir / "favicon.svg",
        static_dir / "assets",
    ]
    if any(not asset.exists() for asset in required_assets):
        raise RuntimeError(
            "Delta frontend assets are missing; "
            "run `npm run build --prefix web`"
        )
    app.mount(
        "/assets",
        StaticFiles(directory=static_dir / "assets"),
        name="assets",
    )

    @app.middleware("http")
    async def protect_loopback(request: Request, call_next):
        authority = request.headers.get("host", "")
        if not _is_loopback_authority(authority):
            return _secure_response(
                JSONResponse(
                    status_code=400,
                    content={
                        "code": "invalid_host",
                        "message": "Delta only accepts loopback hosts",
                    },
                )
            )

        origin = request.headers.get("origin")
        fetch_site = request.headers.get("sec-fetch-site")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and (
            fetch_site == "cross-site"
            or (
                origin is not None
                and (
                    urlsplit(origin).scheme not in {"http", "https"}
                    or urlsplit(origin).netloc.casefold()
                    != authority.casefold()
                )
            )
        ):
            return _secure_response(
                JSONResponse(
                    status_code=403,
                    content={
                        "code": "invalid_origin",
                        "message": "Cross-origin writes are not allowed",
                    },
                )
            )

        response = await call_next(request)
        return _secure_response(response)

    @app.get("/", include_in_schema=False)
    async def get_spa() -> FileResponse:
        return FileResponse(static_dir / "index.html")

    @app.get("/favicon.svg", include_in_schema=False)
    async def get_favicon() -> FileResponse:
        return FileResponse(
            static_dir / "favicon.svg",
            media_type="image/svg+xml",
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

    @app.get(
        "/api/discussions",
        dependencies=[Depends(require_session)],
    )
    async def get_discussions() -> list[dict[str, object]]:
        target = context.target
        return await discussion_service.get_discussions(
            target.project, target.mr_iid
        )

    @app.post(
        "/api/discussions",
        dependencies=[Depends(require_session)],
        status_code=201,
    )
    async def create_discussion(
        request: InlineCommentRequest,
    ) -> dict[str, object]:
        target = context.target
        result = await discussion_service.create_inline(
            target.project,
            target.mr_iid,
            DiffSelection(
                old_path=request.old_path,
                new_path=request.new_path,
                start_old=request.start_old,
                start_new=request.start_new,
                end_old=request.end_old,
                end_new=request.end_new,
            ),
            request.body,
        )
        return {
            "placement": result.placement,
            "fallback": result.fallback,
            "discussion": result.discussion,
        }

    @app.post(
        "/api/discussions/{discussion_id}/notes",
        dependencies=[Depends(require_session)],
        status_code=201,
    )
    async def reply_to_discussion(
        discussion_id: str, request: NoteRequest
    ) -> dict[str, object]:
        target = context.target
        return await discussion_service.reply(
            target.project,
            target.mr_iid,
            discussion_id,
            request.body,
        )

    @app.put(
        "/api/discussions/{discussion_id}",
        dependencies=[Depends(require_session)],
    )
    async def set_discussion_resolved(
        discussion_id: str, request: ResolutionRequest
    ) -> dict[str, object]:
        target = context.target
        return await discussion_service.set_resolved(
            target.project,
            target.mr_iid,
            discussion_id,
            request.resolved,
        )

    @app.exception_handler(GitLabError)
    async def handle_gitlab_error(
        request: Request, error: GitLabError
    ) -> JSONResponse:
        message = str(error)
        if context.token:
            message = message.replace(context.token, "[redacted]")
        return JSONResponse(
            status_code=error.status_code,
            content={
                "code": error.code,
                "message": message,
                "status": error.status_code,
            },
        )

    @app.get("/{path:path}", include_in_schema=False)
    async def get_spa_fallback(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        return FileResponse(static_dir / "index.html")

    app.state.context = context
    app.state.require_session = require_session
    app.state.gitlab_client = client
    app.state.diff_service = diff_service
    app.state.discussion_service = discussion_service
    return app
