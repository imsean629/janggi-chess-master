from __future__ import annotations

import math

from janggi_helper.engine.board import Board
from janggi_helper.engine.evaluator import Evaluator
from janggi_helper.engine.move import Move
from janggi_helper.engine.rules import Rules


class Recommender:
    def __init__(self, evaluator: Evaluator | None = None, depth: int = 2) -> None:
        self.evaluator = evaluator or Evaluator()
        self.depth = depth

    def recommend(self, board: Board, top_n: int = 3) -> list[Move]:
        print("추천 계산 시작")
        legal_moves = Rules.generate_legal_moves(board, board.turn)
        scored_moves: list[Move] = []
        for move in legal_moves:
            test_board = board.clone()
            move_copy = Move.from_dict(move.to_dict())
            Rules.apply_move(test_board, move_copy)
            move.score = self._search(test_board, self.depth - 1, move.piece_side, test_board.turn, -math.inf, math.inf)
            scored_moves.append(move)
        scored_moves.sort(key=lambda item: item.score if item.score is not None else -99999, reverse=True)
        print("추천 계산 완료")
        return scored_moves[:top_n]

    def _search(self, board: Board, depth: int, root_side: str, current_side: str, alpha: float, beta: float) -> float:
        if depth <= 0:
            return self.evaluator.evaluate(board, root_side)
        legal_moves = Rules.generate_legal_moves(board, current_side)
        if not legal_moves:
            return self.evaluator.evaluate(board, root_side)
        maximizing = current_side == root_side
        best = -math.inf if maximizing else math.inf
        for move in legal_moves:
            next_board = board.clone()
            Rules.apply_move(next_board, Move.from_dict(move.to_dict()))
            score = self._search(next_board, depth - 1, root_side, next_board.turn, alpha, beta)
            if maximizing:
                best = max(best, score)
                alpha = max(alpha, score)
            else:
                best = min(best, score)
                beta = min(beta, score)
            if beta <= alpha:
                break
        return round(best, 2)
