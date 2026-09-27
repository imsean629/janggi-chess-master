from __future__ import annotations

import json
from pathlib import Path

from janggi_helper.engine.board import Board
from janggi_helper.engine.move import Move


class StorageService:
    def save_game(self, file_path: str, board: Board, move_history: list[Move]) -> None:
        data = {"board": board.to_dict(), "move_history": [move.to_dict() for move in move_history]}
        with Path(file_path).open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
        print(f"저장 성공: {file_path}")

    def load_game(self, file_path: str) -> tuple[Board, list[Move]]:
        with Path(file_path).open("r", encoding="utf-8") as file:
            data = json.load(file)
        if "board" not in data or "move_history" not in data:
            raise ValueError("JSON 형식 오류입니다.")
        board = Board.from_dict(data["board"])
        move_history = [Move.from_dict(item) for item in data["move_history"]]
        print(f"불러오기 성공: {file_path}")
        return board, move_history
