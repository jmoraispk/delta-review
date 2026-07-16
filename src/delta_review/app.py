from __future__ import annotations

from fastapi import Depends, FastAPI, Header, HTTPException

from delta_review.security import RuntimeContext


def create_app(context: RuntimeContext) -> FastAPI:
    app = FastAPI(title="Delta", docs_url=None, redoc_url=None)

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

    app.state.context = context
    app.state.require_session = require_session
    return app
