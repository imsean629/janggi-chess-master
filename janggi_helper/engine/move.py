from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Move:
    from_x: int
    from_y: int
    to_x: int
    to_y: int
    piece_side: str
    piece_kind: str
    captured_side: str | None = None
    captured_kind: str | None = None
    score: float | None = None

    @property
    def piece_label(self) -> str:
        return f"{self.piece_side}{self.piece_kind}"

    def to_display(self) -> str:
        text = f"{self.piece_label} ({self.from_x},{self.from_y})→({self.to_x},{self.to_y})"
        if self.score is not None:
            text += f" / 점수 {self.score:+.2f}"
        return text

    def to_record(self, move_number: int) -> str:
        return f"{move_number}. {self.piece_label} ({self.from_x},{self.from_y})→({self.to_x},{self.to_y})"

    def to_dict(self) -> dict[str, Any]:
        return {
            "from_x": self.from_x,
            "from_y": self.from_y,
            "to_x": self.to_x,
            "to_y": self.to_y,
            "piece_side": self.piece_side,
            "piece_kind": self.piece_kind,
            "captured_side": self.captured_side,
            "captured_kind": self.captured_kind,
            "score": self.score,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Move":
        return cls(**data)
