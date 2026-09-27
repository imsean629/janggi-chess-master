from janggi_helper.engine.board import Piece


INITIAL_SIDE = "초"
DEFAULT_LAYOUT = "상마마상"
LAYOUT_OPTIONS = ("상마마상", "마상상마", "마상마상", "상마상마")
LAYOUT_X_POSITIONS = (1, 2, 6, 7)


def build_initial_pieces(red_layout: str = DEFAULT_LAYOUT, blue_layout: str = DEFAULT_LAYOUT) -> list[Piece]:
    """진영별 마/상 배치 선택을 반영한 기본 배치를 만든다."""
    if red_layout not in LAYOUT_OPTIONS:
        red_layout = DEFAULT_LAYOUT
    if blue_layout not in LAYOUT_OPTIONS:
        blue_layout = DEFAULT_LAYOUT

    pieces = [
        Piece("한", "차", 0, 0),
        Piece("한", "사", 3, 0),
        Piece("한", "장", 4, 1),
        Piece("한", "사", 5, 0),
        Piece("한", "차", 8, 0),
        Piece("한", "포", 1, 2),
        Piece("한", "포", 7, 2),
        Piece("한", "졸", 0, 3),
        Piece("한", "졸", 2, 3),
        Piece("한", "졸", 4, 3),
        Piece("한", "졸", 6, 3),
        Piece("한", "졸", 8, 3),
        Piece("초", "차", 0, 9),
        Piece("초", "사", 3, 9),
        Piece("초", "장", 4, 8),
        Piece("초", "사", 5, 9),
        Piece("초", "차", 8, 9),
        Piece("초", "포", 1, 7),
        Piece("초", "포", 7, 7),
        Piece("초", "졸", 0, 6),
        Piece("초", "졸", 2, 6),
        Piece("초", "졸", 4, 6),
        Piece("초", "졸", 6, 6),
        Piece("초", "졸", 8, 6),
    ]

    for x, kind in zip(LAYOUT_X_POSITIONS, red_layout):
        pieces.append(Piece("한", kind, x, 0))
    for x, kind in zip(LAYOUT_X_POSITIONS, blue_layout):
        pieces.append(Piece("초", kind, x, 9))
    return pieces


INITIAL_PIECES = build_initial_pieces()
