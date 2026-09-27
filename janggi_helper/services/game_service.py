from __future__ import annotations

from dataclasses import dataclass

from janggi_helper.data.presets import DEFAULT_LAYOUT, INITIAL_SIDE, build_initial_pieces
from janggi_helper.engine.board import Board, Piece
from janggi_helper.engine.evaluator import Evaluator
from janggi_helper.engine.move import Move
from janggi_helper.engine.recommender import Recommender
from janggi_helper.engine.rules import Rules
from janggi_helper.services.storage_service import StorageService


@dataclass
class ViewState:
    current_turn_text: str
    last_move_text: str
    evaluation_text: str
    recommendation_lines: list[str]
    move_records: list[str]
    selected_pos: tuple[int, int] | None
    legal_targets: list[tuple[int, int]]
    last_move_cells: list[tuple[int, int]]
    setup_mode: bool
    setup_text: str


class GameService:
    PIECE_KINDS = ["차", "마", "상", "사", "장", "포", "졸"]

    def __init__(self) -> None:
        self.storage_service = StorageService()
        self.evaluator = Evaluator()
        self.recommender = Recommender(self.evaluator, depth=2)
        self.board = Board(turn=INITIAL_SIDE)
        self.selected_pos: tuple[int, int] | None = None
        self.cached_legal_moves: list[Move] = []
        self.move_history: list[Move] = []
        self.undo_stack: list[dict] = []
        self.setup_mode = False
        self.setup_side = "초"
        self.setup_kind = "차"
        self.red_layout = DEFAULT_LAYOUT
        self.blue_layout = DEFAULT_LAYOUT
        self.load_initial_board()

    def load_initial_board(self) -> None:
        pieces = build_initial_pieces(self.red_layout, self.blue_layout)
        self.board = Board([piece.clone() for piece in pieces], turn=INITIAL_SIDE)
        self.selected_pos = None
        self.cached_legal_moves = []
        self.move_history = []
        self.undo_stack = []

    def set_initial_layouts(self, red_layout: str, blue_layout: str) -> None:
        self.red_layout = red_layout
        self.blue_layout = blue_layout

    def clear_board(self) -> None:
        self.board = Board(turn="초")
        self.selected_pos = None
        self.cached_legal_moves = []
        self.move_history = []
        self.undo_stack = []

    def restore_loaded_state(self, board: Board, move_history: list[Move]) -> None:
        self.board = board
        self.move_history = move_history
        self.selected_pos = None
        self.cached_legal_moves = []
        self.undo_stack = []

    def get_piece_label(self, x: int, y: int) -> str:
        piece = self.board.get_piece(x, y)
        return piece.label if piece else ""

    def handle_cell_click(self, x: int, y: int) -> tuple[bool, str | None]:
        if not self.board.is_inside(x, y):
            return False, "잘못된 좌표입니다."

        if self.setup_mode:
            return self._handle_setup_click(x, y)

        piece = self.board.get_piece(x, y)

        if self.selected_pos is None:
            if piece is None:
                return False, "선택 없이 빈칸을 눌렀습니다."
            if piece.side != self.board.turn:
                return False, "현재 턴의 기물이 아닙니다."
            self._select_piece(piece)
            return True, None

        if piece and piece.side == self.board.turn:
            self._select_piece(piece)
            return True, None

        for move in self.cached_legal_moves:
            if move.to_x == x and move.to_y == y:
                self._push_undo_state()
                Rules.apply_move(self.board, move)
                self.move_history.append(move)
                self.selected_pos = None
                self.cached_legal_moves = []
                print(f"이동 성공: {move.to_display()}")
                return True, None
        return False, "이동할 수 없는 위치입니다."

    def _handle_setup_click(self, x: int, y: int) -> tuple[bool, str | None]:
        self._push_undo_state()
        self.selected_pos = None
        self.cached_legal_moves = []

        if self.setup_kind == "지우기":
            removed = self.board.remove_piece_at(x, y)
            if removed is None:
                return False, "지울 기물이 없습니다."
            self.board.last_move = None
            print(f"배치 편집: 기물 제거 ({x},{y})")
            return True, None

        if self.setup_kind == "장":
            existing_king = self.board.find_king(self.setup_side)
            if existing_king and (existing_king.x != x or existing_king.y != y):
                self.board.remove_piece_at(existing_king.x, existing_king.y)

        self.board.add_piece(Piece(self.setup_side, self.setup_kind, x, y))
        self.board.last_move = None
        print(f"배치 편집: {self.setup_side}{self.setup_kind} ({x},{y})")
        return True, None

    def _select_piece(self, piece: Piece) -> None:
        self.selected_pos = (piece.x, piece.y)
        print(f"기물 선택: {piece.label} ({piece.x},{piece.y})")
        self.cached_legal_moves = [
            move
            for move in Rules.generate_legal_moves(self.board, self.board.turn)
            if move.from_x == piece.x and move.from_y == piece.y
        ]

    def _push_undo_state(self) -> None:
        self.undo_stack.append({"board": self.board.to_dict(), "move_history": [move.to_dict() for move in self.move_history]})

    def undo(self) -> tuple[bool, str]:
        if not self.undo_stack:
            return False, "되돌릴 수 있는 수가 없습니다."
        snapshot = self.undo_stack.pop()
        self.board = Board.from_dict(snapshot["board"])
        self.move_history = [Move.from_dict(item) for item in snapshot["move_history"]]
        self.selected_pos = None
        self.cached_legal_moves = []
        return True, "한 수를 되돌렸습니다."

    def get_recommendations(self) -> list[Move]:
        return self.recommender.recommend(self.board, top_n=3)

    def set_turn(self, turn: str) -> None:
        self.board.turn = turn

    def set_setup_piece(self, side: str, kind: str) -> None:
        self.setup_side = side
        self.setup_kind = kind

    def toggle_setup_mode(self) -> tuple[bool, str]:
        self.setup_mode = not self.setup_mode
        self.selected_pos = None
        self.cached_legal_moves = []
        if self.setup_mode:
            return True, "배치 편집 모드를 시작했습니다."
        return True, "배치 편집 모드를 종료했습니다."

    def save_state(self, file_path: str) -> None:
        self.storage_service.save_game(file_path, self.board, self.move_history)

    def load_state(self, file_path: str) -> None:
        board, move_history = self.storage_service.load_game(file_path)
        self.restore_loaded_state(board, move_history)

    def build_view_state(self) -> ViewState:
        if self._can_analyze_board():
            score = self.evaluator.evaluate(self.board, "초")
            evaluation_text = self.evaluator.describe(score)
            recommendations = self._build_recommendation_lines()
        else:
            evaluation_text = "판세 평가: 양쪽 장을 배치하세요."
            recommendations = ["양쪽 장을 배치하면 추천 수를 볼 수 있습니다."]
        last_move_text = "마지막 수: 없음"
        if self.move_history:
            last_move_text = f"마지막 수: {self.move_history[-1].to_display()}"
        return ViewState(
            current_turn_text=f"현재 턴: {self.board.turn}",
            last_move_text=last_move_text,
            evaluation_text=evaluation_text,
            recommendation_lines=recommendations,
            move_records=[move.to_record(i + 1) for i, move in enumerate(self.move_history)],
            selected_pos=self.selected_pos,
            legal_targets=[(move.to_x, move.to_y) for move in self.cached_legal_moves],
            last_move_cells=self._last_move_cells(),
            setup_mode=self.setup_mode,
            setup_text=self._setup_text(),
        )

    def _build_recommendation_lines(self) -> list[str]:
        if self.setup_mode:
            return ["배치 편집 모드를 종료하면 추천 수를 계산합니다."]
        legal_moves = Rules.generate_legal_moves(self.board, self.board.turn)
        if not legal_moves:
            return ["추천 수가 없습니다."]
        return [f"추천 {index}: {move.to_display()}" for index, move in enumerate(self.get_recommendations(), start=1)]

    def _last_move_cells(self) -> list[tuple[int, int]]:
        if not self.board.last_move:
            return []
        return [tuple(self.board.last_move["from"]), tuple(self.board.last_move["to"])]

    def _can_analyze_board(self) -> bool:
        return self.board.find_king("초") is not None and self.board.find_king("한") is not None

    def _setup_text(self) -> str:
        if not self.setup_mode:
            return "배치 편집: 꺼짐"
        if self.setup_kind == "지우기":
            return "배치 편집: 지우개 선택"
        return f"배치 편집: {self.setup_side}{self.setup_kind} 배치 중"
