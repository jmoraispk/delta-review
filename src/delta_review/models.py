from pydantic import (
    BaseModel,
    Field,
    StrictBool,
    field_validator,
    model_validator,
)


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
    start_old: int | None = Field(default=None, gt=0)
    start_new: int | None = Field(default=None, gt=0)
    end_old: int | None = Field(default=None, gt=0)
    end_new: int | None = Field(default=None, gt=0)

    @field_validator("old_path", "new_path", mode="before")
    @classmethod
    def strip_path(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_coordinates(self) -> "InlineCommentRequest":
        if self.start_old is None and self.start_new is None:
            raise ValueError("selection start must include a line")
        if self.end_old is None and self.end_new is None:
            raise ValueError("selection end must include a line")
        shares_side = (
            self.start_old is not None and self.end_old is not None
        ) or (
            self.start_new is not None and self.end_new is not None
        )
        if not shares_side:
            raise ValueError("selection endpoints must share a diff side")
        return self


class ResolutionRequest(BaseModel):
    resolved: StrictBool
