import asyncio
from importlib.resources import files

import delta_review
from delta_review.app import create_app
from delta_review.config import Target
from delta_review.security import RuntimeContext


package_root = files(delta_review)
assert package_root.joinpath("static", "index.html").is_file()
assert any(package_root.joinpath("static", "assets").iterdir())

context = RuntimeContext(
    target=Target(
        host="gitlab.example.com",
        api_base="https://gitlab.example.com/api/v4",
        project="group/project",
        mr_iid=1,
    ),
    token="wheel-smoke-token",
    session_secret="wheel-smoke-session",
)
app = create_app(context)
paths = {getattr(route, "path", None) for route in app.routes}
assert "/" in paths
assert "/api/config" in paths
asyncio.run(app.state.gitlab_client.close())

print("wheel package data and FastAPI routes verified")
