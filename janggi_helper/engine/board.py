from __future__ import annotations

from dataclasses import dataclass
from typing import Any


BOARD_WIDTH = 9
BOARD_HEIGHT = 10
SIDES = ("초", "한")


@dataclass
class Piece:
    side: str
    kind: str
    x: int
    y: int

    @property
    def label(self) -> str:
        return f"{self.side}{self.kind}"

    def clone(self) -> "Piece":
        return Piece(self.side, self.kind, self.x, self.y)

    def to_dict(self) -> dict[str, Any]:
        return {"side": self.side, "kind": self.kind, "x": self.x, "y": self.y}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Piece":
        return cls(data["side"], data["kind"], int(data["x"]), int(data["y"]))


class Board:
    def __init__(self, pieces: list[Piece] | None = None, turn: str = "초") -> None:
        self.turn = turn
        self.pieces: list[Piece] = []
        self.last_move: dict[str, Any] | None = None
        if pieces:
            for piece in pieces:
                self.add_piece(piece.clone())

    def clear(self) -> None:
        self.pieces.clear()
        self.last_move = None

    def clone(self) -> "Board":
        board = Board([piece.clone() for piece in self.pieces], self.turn)
        board.last_move = dict(self.last_move) if self.last_move else None
        return board

    def is_inside(self, x: int, y: int) -> bool:
        return 0 <= x < BOARD_WIDTH and 0 <= y < BOARD_HEIGHT

    def add_piece(self, piece: Piece) -> None:
        if not self.is_inside(piece.x, piece.y):
            raise ValueError("잘못된 좌표입니다.")
        existing = self.get_piece(piece.x, piece.y)
        if existing:
            self.pieces.remove(existing)
        self.pieces.append(piece)

    def get_piece(self, x: int, y: int) -> Piece | None:
        for piece in self.pieces:
            if piece.x == x and piece.y == y:
                return piece
        return None

    def remove_piece_at(self, x: int, y: int) -> Piece | None:
        piece = self.get_piece(x, y)
        if piece:
            self.pieces.remove(piece)
        return piece

    def move_piece(self, from_x: int, from_y: int, to_x: int, to_y: int) -> tuple[Piece, Piece | None]:
        piece = self.get_piece(from_x, from_y)
        if piece is None:
            raise ValueError("이동할 기물이 없습니다.")
        captured = self.remove_piece_at(to_x, to_y)
        piece.x = to_x
        piece.y = to_y
        return piece, captured

    def find_king(self, side: str) -> Piece | None:
        for piece in self.pieces:
            if piece.side == side and piece.kind == "장":
                return piece
        return None

    def opponent_of(self, side: str) -> str:
        return "한" if side == "초" else "초"

    def to_dict(self) -> dict[str, Any]:
        return {"turn": self.turn, "last_move": self.last_move, "pieces": [piece.to_dict() for piece in self.pieces]}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Board":
        pieces = [Piece.from_dict(item) for item in data["pieces"]]
        board = cls(pieces=pieces, turn=data.get("turn", "초"))
        board.last_move = data.get("last_move")
        return board
