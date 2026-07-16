from importlib.resources import files

import delta_review


def test_built_frontend_is_available_as_package_data() -> None:
    package_root = files(delta_review)
    assert package_root.joinpath("static", "index.html").is_file()
    assert package_root.joinpath("static", "favicon.svg").is_file()
    assert any(package_root.joinpath("static", "assets").iterdir())
