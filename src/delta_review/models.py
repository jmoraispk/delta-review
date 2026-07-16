from pydantic import BaseModel


class DiffFile(BaseModel):
    old_path: str
    new_path: str
    diff: str
    new_file: bool = False
    renamed_file: bool = False
    deleted_file: bool = False
    collapsed: bool = False
    too_large: bool = False


class MergeRequest(BaseModel):
    iid: int
    title: str
    web_url: str
    state: str
    source_branch: str
    target_branch: str
