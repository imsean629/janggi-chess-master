from __future__ import annotations

from janggi_helper.engine.board import BOARD_HEIGHT, BOARD_WIDTH, Board, Piece
from janggi_helper.engine.move import Move


class Rules:
    PALACE_MAP = {
        "한": {(3, 0), (4, 0), (5, 0), (3, 1), (4, 1), (5, 1), (3, 2), (4, 2), (5, 2)},
        "초": {(3, 7), (4, 7), (5, 7), (3, 8), (4, 8), (5, 8), (3, 9), (4, 9), (5, 9)},
    }

    PALACE_DIAGONALS = {
        ("한", (3, 0)): {(4, 1)},
        ("한", (5, 0)): {(4, 1)},
        ("한", (3, 2)): {(4, 1)},
        ("한", (5, 2)): {(4, 1)},
        ("한", (4, 1)): {(3, 0), (5, 0), (3, 2), (5, 2)},
        ("초", (3, 7)): {(4, 8)},
        ("초", (5, 7)): {(4, 8)},
        ("초", (3, 9)): {(4, 8)},
        ("초", (5, 9)): {(4, 8)},
        ("초", (4, 8)): {(3, 7), (5, 7), (3, 9), (5, 9)},
    }

    HORSE_PATTERNS = [
        ((0, -1), [(-1, -2), (1, -2)]),
        ((1, 0), [(2, -1), (2, 1)]),
        ((0, 1), [(-1, 2), (1, 2)]),
        ((-1, 0), [(-2, -1), (-2, 1)]),
    ]

    ELEPHANT_PATTERNS = [
        ([(0, -1), (-1, -2)], (-2, -3)),
        ([(0, -1), (1, -2)], (2, -3)),
        ([(1, 0), (2, -1)], (3, -2)),
        ([(1, 0), (2, 1)], (3, 2)),
        ([(0, 1), (-1, 2)], (-2, 3)),
        ([(0, 1), (1, 2)], (2, 3)),
        ([(-1, 0), (-2, -1)], (-3, -2)),
        ([(-1, 0), (-2, 1)], (-3, 2)),
    ]

    @classmethod
    def is_palace(cls, side: str, x: int, y: int) -> bool:
        return (x, y) in cls.PALACE_MAP[side]

    @classmethod
    def palace_targets(cls, piece: Piece) -> set[tuple[int, int]]:
        position = (piece.x, piece.y)
        targets: set[tuple[int, int]] = set()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = piece.x + dx, piece.y + dy
            if cls.is_palace(piece.side, nx, ny):
                targets.add((nx, ny))
        targets.update(cls.PALACE_DIAGONALS.get((piece.side, position), set()))
        return targets

    @classmethod
    def generate_legal_moves(cls, board: Board, side: str | None = None) -> list[Move]:
        target_side = side or board.turn
        moves: list[Move] = []
        for piece in board.pieces:
            if piece.side != target_side:
                continue
            for move in cls.generate_piece_moves(board, piece):
                if cls.is_legal_move(board, move, target_side):
                    moves.append(move)
        return moves

    @classmethod
    def generate_piece_moves(cls, board: Board, piece: Piece) -> list[Move]:
        if piece.kind == "차":
            return cls._rook_moves(board, piece)
        if piece.kind == "마":
            return cls._horse_moves(board, piece)
        if piece.kind == "상":
            return cls._elephant_moves(board, piece)
        if piece.kind in {"사", "장"}:
            return cls._palace_piece_moves(board, piece)
        if piece.kind == "포":
            return cls._cannon_moves(board, piece)
        if piece.kind == "졸":
            return cls._soldier_moves(board, piece)
        return []

    @classmethod
    def is_legal_move(cls, board: Board, move: Move, side: str | None = None) -> bool:
        moving_side = side or move.piece_side
        test_board = board.clone()
        cls.apply_move(test_board, Move.from_dict(move.to_dict()), switch_turn=False)
        return not cls.is_in_check(test_board, moving_side)

    @classmethod
    def apply_move(cls, board: Board, move: Move, switch_turn: bool = True) -> None:
        moved_piece, captured = board.move_piece(move.from_x, move.from_y, move.to_x, move.to_y)
        if captured:
            move.captured_side = captured.side
            move.captured_kind = captured.kind
        board.last_move = {"from": [move.from_x, move.from_y], "to": [move.to_x, move.to_y], "piece": moved_piece.label}
        if switch_turn:
            board.turn = board.opponent_of(moved_piece.side)

    @classmethod
    def is_in_check(cls, board: Board, side: str) -> bool:
        king = board.find_king(side)
        if king is None:
            return True
        if cls.kings_face_each_other(board):
            return True
        enemy_side = board.opponent_of(side)
        for piece in board.pieces:
            if piece.side != enemy_side:
                continue
            for move in cls.generate_piece_moves(board, piece):
                if move.to_x == king.x and move.to_y == king.y:
                    return True
        return False

    @classmethod
    def kings_face_each_other(cls, board: Board) -> bool:
        cho_king = board.find_king("초")
        han_king = board.find_king("한")
        if cho_king is None or han_king is None:
            return False
        if cho_king.x != han_king.x:
            return False
        y1, y2 = sorted([cho_king.y, han_king.y])
        for y in range(y1 + 1, y2):
            if board.get_piece(cho_king.x, y) is not None:
                return False
        return True

    @classmethod
    def is_checkmate_like(cls, board: Board, side: str) -> bool:
        return cls.is_in_check(board, side) and len(cls.generate_legal_moves(board, side)) == 0

    @classmethod
    def attacks_square(cls, board: Board, attacker_side: str, x: int, y: int) -> bool:
        for piece in board.pieces:
            if piece.side != attacker_side:
                continue
            for move in cls.generate_piece_moves(board, piece):
                if move.to_x == x and move.to_y == y:
                    return True
        return False

    @classmethod
    def _create_move(cls, piece: Piece, to_x: int, to_y: int, target: Piece | None) -> Move | None:
        if target and target.side == piece.side:
            return None
        return Move(piece.x, piece.y, to_x, to_y, piece.side, piece.kind, target.side if target else None, target.kind if target else None)

    @classmethod
    def _rook_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = piece.x + dx, piece.y + dy
            while 0 <= nx < BOARD_WIDTH and 0 <= ny < BOARD_HEIGHT:
                target = board.get_piece(nx, ny)
                move = cls._create_move(piece, nx, ny, target)
                if move:
                    moves.append(move)
                if target is not None:
                    break
                nx += dx
                ny += dy
        return moves

    @classmethod
    def _horse_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        for leg, endpoints in cls.HORSE_PATTERNS:
            lx, ly = piece.x + leg[0], piece.y + leg[1]
            if not board.is_inside(lx, ly) or board.get_piece(lx, ly):
                continue
            for end_dx, end_dy in endpoints:
                nx, ny = piece.x + end_dx, piece.y + end_dy
                if not board.is_inside(nx, ny):
                    continue
                target = board.get_piece(nx, ny)
                move = cls._create_move(piece, nx, ny, target)
                if move:
                    moves.append(move)
        return moves

    @classmethod
    def _elephant_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        for blockers, end in cls.ELEPHANT_PATTERNS:
            blocked = False
            for block_dx, block_dy in blockers:
                bx, by = piece.x + block_dx, piece.y + block_dy
                if not board.is_inside(bx, by) or board.get_piece(bx, by):
                    blocked = True
                    break
            if blocked:
                continue
            nx, ny = piece.x + end[0], piece.y + end[1]
            if not board.is_inside(nx, ny):
                continue
            target = board.get_piece(nx, ny)
            move = cls._create_move(piece, nx, ny, target)
            if move:
                moves.append(move)
        return moves

    @classmethod
    def _palace_piece_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        for nx, ny in cls.palace_targets(piece):
            target = board.get_piece(nx, ny)
            move = cls._create_move(piece, nx, ny, target)
            if move:
                moves.append(move)
        return moves

    @classmethod
    def _cannon_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = piece.x + dx, piece.y + dy
            jumped = False
            while 0 <= nx < BOARD_WIDTH and 0 <= ny < BOARD_HEIGHT:
                target = board.get_piece(nx, ny)
                if not jumped:
                    if target is None:
                        nx += dx
                        ny += dy
                        continue
                    if target.kind == "포":
                        break
                    jumped = True
                    nx += dx
                    ny += dy
                    continue
                if target is None:
                    moves.append(Move(piece.x, piece.y, nx, ny, piece.side, piece.kind))
                else:
                    if target.side != piece.side and target.kind != "포":
                        moves.append(Move(piece.x, piece.y, nx, ny, piece.side, piece.kind, target.side, target.kind))
                    break
                nx += dx
                ny += dy
        return moves

    @classmethod
    def _soldier_moves(cls, board: Board, piece: Piece) -> list[Move]:
        moves: list[Move] = []
        forward = -1 if piece.side == "초" else 1
        candidates = [(0, forward), (-1, 0), (1, 0)]
        if cls.is_palace(piece.side, piece.x, piece.y):
            for nx, ny in cls.PALACE_DIAGONALS.get((piece.side, (piece.x, piece.y)), set()):
                if (ny - piece.y) == forward or ny == piece.y:
                    candidates.append((nx - piece.x, ny - piece.y))
        for dx, dy in candidates:
            nx, ny = piece.x + dx, piece.y + dy
            if not board.is_inside(nx, ny):
                continue
            target = board.get_piece(nx, ny)
            move = cls._create_move(piece, nx, ny, target)
            if move:
                moves.append(move)
        return moves
