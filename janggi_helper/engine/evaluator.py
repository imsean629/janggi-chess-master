from __future__ import annotations

from janggi_helper.engine.board import Board
from janggi_helper.engine.pieces import PIECE_VALUES
from janggi_helper.engine.rules import Rules


class Evaluator:
    def evaluate(self, board: Board, perspective: str) -> float:
        my_score = self._raw_score(board, perspective)
        enemy = board.opponent_of(perspective)
        enemy_score = self._raw_score(board, enemy)
        total = my_score - enemy_score
        if Rules.is_in_check(board, enemy):
            total += 0.8
        if Rules.is_in_check(board, perspective):
            total -= 0.8
        if Rules.is_checkmate_like(board, enemy):
            total += 500.0
        if Rules.is_checkmate_like(board, perspective):
            total -= 500.0
        return round(total, 2)

    def describe(self, score: float) -> str:
        if score > 1.0:
            return f"판세 평가: 초 우세 ({score:+.1f})"
        if score < -1.0:
            return f"판세 평가: 한 우세 ({score:+.1f})"
        return f"판세 평가: 균형 ({score:+.1f})"

    def _raw_score(self, board: Board, side: str) -> float:
        score = len(Rules.generate_legal_moves(board, side)) * 0.08
        enemy = board.opponent_of(side)
        threatened_penalty = 0.0
        for piece in board.pieces:
            if piece.side != side:
                continue
            score += PIECE_VALUES[piece.kind]
            if Rules.attacks_square(board, enemy, piece.x, piece.y):
                threatened_penalty += PIECE_VALUES[piece.kind] * (0.18 if piece.kind != "장" else 0.05)
            score += self._activity_bonus(piece.x, piece.y, side)
            score += self._palace_safety_bonus(board, piece.side, piece.kind, piece.x, piece.y)
        return score - threatened_penalty

    def _activity_bonus(self, x: int, y: int, side: str) -> float:
        bonus = 0.0
        if 2 <= x <= 6:
            bonus += 0.15
        bonus += (9 - y) * 0.03 if side == "초" else y * 0.03
        return bonus

    def _palace_safety_bonus(self, board: Board, side: str, kind: str, x: int, y: int) -> float:
        if kind == "장":
            guards = 0
            for piece in board.pieces:
                if piece.side == side and piece.kind == "사" and abs(piece.x - x) <= 1 and abs(piece.y - y) <= 1:
                    guards += 1
            return guards * 0.35
        if kind == "사":
            return 0.25 if Rules.is_palace(side, x, y) else 0.0
        return 0.0
