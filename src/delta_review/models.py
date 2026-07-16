from pydantic import BaseModel, Field, StrictBool, field_validator


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


class NoteRequest(BaseModel):
    body: str = Field(min_length=1, max_length=1_000_000)

    @field_validator("body", mode="before")
    @classmethod
    def strip_body(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class InlineCommentRequest(NoteRequest):
    old_path: str = Field(min_length=1)
    new_path: str = Field(min_length=1)
    start_old: int | None = None
    start_new: int | None = None
    end_old: int | None = None
    end_new: int | None = None


class ResolutionRequest(BaseModel):
    resolved: StrictBool
