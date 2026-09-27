from __future__ import annotations

from PySide6.QtCore import QPointF, QRectF, QSize, Qt, Signal
from PySide6.QtGui import (
    QColor,
    QConicalGradient,
    QFont,
    QLinearGradient,
    QMouseEvent,
    QPainter,
    QPainterPath,
    QPen,
    QRadialGradient,
)
from PySide6.QtWidgets import QSizePolicy, QWidget


class BoardWidget(QWidget):
    cell_clicked = Signal(int, int)

    RED_SIDE = "한"
    BLUE_SIDE = "초"

    PIECE_TEXT = {
        ("한", "차"): "車",
        ("한", "마"): "馬",
        ("한", "상"): "象",
        ("한", "사"): "士",
        ("한", "장"): "漢",
        ("한", "포"): "包",
        ("한", "졸"): "卒",
        ("초", "차"): "車",
        ("초", "마"): "馬",
        ("초", "상"): "象",
        ("초", "사"): "士",
        ("초", "장"): "楚",
        ("초", "포"): "包",
        ("초", "졸"): "兵",
    }

    def __init__(self) -> None:
        super().__init__()
        self.labels: dict[tuple[int, int], str] = {}
        self.selected: tuple[int, int] | None = None
        self.legal_targets: set[tuple[int, int]] = set()
        self.last_move_cells: set[tuple[int, int]] = set()
        self.setMinimumSize(660, 720)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

    def sizeHint(self) -> QSize:
        return QSize(720, 760)

    def update_board(
        self,
        labels: dict[tuple[int, int], str],
        selected: tuple[int, int] | None,
        legal_targets: list[tuple[int, int]],
        last_move_cells: list[tuple[int, int]],
    ) -> None:
        self.labels = labels
        self.selected = selected
        self.legal_targets = set(legal_targets)
        self.last_move_cells = set(last_move_cells)
        self.update()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() != Qt.MouseButton.LeftButton:
            return
        coord = self._coord_from_point(event.position())
        if coord:
            self.cell_clicked.emit(coord[0], coord[1])

    def paintEvent(self, event) -> None:  # noqa: ANN001
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.fillRect(self.rect(), QColor("#efe1c4"))

        board_rect, cell = self._board_geometry()
        self._draw_board_background(painter, board_rect)
        self._draw_grid(painter, board_rect, cell)
        self._draw_markers(painter, board_rect, cell)
        self._draw_highlights(painter, board_rect, cell)
        self._draw_pieces(painter, board_rect, cell)

    def _board_geometry(self) -> tuple[QRectF, float]:
        available_w = max(1, self.width() - 56)
        available_h = max(1, self.height() - 56)
        cell = min(available_w / 8, available_h / 9)
        board_w = cell * 8
        board_h = cell * 9
        left = (self.width() - board_w) / 2
        top = (self.height() - board_h) / 2
        return QRectF(left, top, board_w, board_h), cell

    def _point_for(self, board_rect: QRectF, cell: float, x: int, y: int) -> QPointF:
        return QPointF(board_rect.left() + x * cell, board_rect.top() + y * cell)

    def _coord_from_point(self, point: QPointF) -> tuple[int, int] | None:
        board_rect, cell = self._board_geometry()
        x = round((point.x() - board_rect.left()) / cell)
        y = round((point.y() - board_rect.top()) / cell)
        if not (0 <= x <= 8 and 0 <= y <= 9):
            return None
        center = self._point_for(board_rect, cell, x, y)
        if (point - center).manhattanLength() > cell * 0.45:
            return None
        return x, y

    def _draw_board_background(self, painter: QPainter, board_rect: QRectF) -> None:
        frame = board_rect.adjusted(-28, -28, 28, 28)
        shadow = frame.adjusted(5, 6, 5, 6)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(60, 42, 24, 55))
        painter.drawRoundedRect(shadow, 8, 8)

        wood = QLinearGradient(frame.topLeft(), frame.bottomRight())
        wood.setColorAt(0.0, QColor("#e7c56f"))
        wood.setColorAt(0.45, QColor("#d8ad4f"))
        wood.setColorAt(1.0, QColor("#f0d083"))
        painter.setBrush(wood)
        painter.setPen(QPen(QColor("#80602f"), 3))
        painter.drawRoundedRect(frame, 8, 8)

        painter.setPen(QPen(QColor(122, 86, 35, 32), 1))
        for i in range(15):
            x = frame.left() + i * frame.width() / 14
            painter.drawLine(QPointF(x, frame.top() + 4), QPointF(x + 18, frame.bottom() - 4))

    def _draw_grid(self, painter: QPainter, board_rect: QRectF, cell: float) -> None:
        grid_pen = QPen(QColor("#4e3a24"), 1.5)
        painter.setPen(grid_pen)
        for x in range(9):
            p1 = self._point_for(board_rect, cell, x, 0)
            p2 = self._point_for(board_rect, cell, x, 9)
            painter.drawLine(p1, p2)
        for y in range(10):
            p1 = self._point_for(board_rect, cell, 0, y)
            p2 = self._point_for(board_rect, cell, 8, y)
            painter.drawLine(p1, p2)

        palace_lines = [
            ((3, 0), (5, 2)),
            ((5, 0), (3, 2)),
            ((3, 7), (5, 9)),
            ((5, 7), (3, 9)),
        ]
        painter.setPen(QPen(QColor("#4e3a24"), 1.4))
        for start, end in palace_lines:
            painter.drawLine(self._point_for(board_rect, cell, *start), self._point_for(board_rect, cell, *end))

    def _draw_markers(self, painter: QPainter, board_rect: QRectF, cell: float) -> None:
        painter.setPen(QPen(QColor("#614528"), 1.2))
        for x, y in [(0, 3), (8, 3), (0, 6), (8, 6)]:
            p = self._point_for(board_rect, cell, x, y)
            size = cell * 0.08
            painter.drawLine(QPointF(p.x() - size, p.y()), QPointF(p.x() + size, p.y()))
            painter.drawLine(QPointF(p.x(), p.y() - size), QPointF(p.x(), p.y() + size))

    def _draw_highlights(self, painter: QPainter, board_rect: QRectF, cell: float) -> None:
        for x, y in self.last_move_cells:
            self._draw_target_ring(painter, board_rect, cell, x, y, QColor("#f5c542"), 3)
        for x, y in self.legal_targets:
            center = self._point_for(board_rect, cell, x, y)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(46, 145, 80, 105))
            painter.drawEllipse(center, cell * 0.12, cell * 0.12)
        if self.selected:
            self._draw_target_ring(painter, board_rect, cell, self.selected[0], self.selected[1], QColor("#6b35d8"), 4)

    def _draw_target_ring(
        self,
        painter: QPainter,
        board_rect: QRectF,
        cell: float,
        x: int,
        y: int,
        color: QColor,
        width: int,
    ) -> None:
        center = self._point_for(board_rect, cell, x, y)
        size = cell * 0.52
        painter.setPen(QPen(color, width))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawRoundedRect(QRectF(center.x() - size / 2, center.y() - size / 2, size, size), 4, 4)

    def _draw_pieces(self, painter: QPainter, board_rect: QRectF, cell: float) -> None:
        for y in range(10):
            for x in range(9):
                label = self.labels.get((x, y), "")
                if label:
                    self._draw_piece(painter, board_rect, cell, x, y, label)

    def _draw_piece(self, painter: QPainter, board_rect: QRectF, cell: float, x: int, y: int, label: str) -> None:
        side = label[0]
        kind = label[1:]
        center = self._point_for(board_rect, cell, x, y)
        radius = cell * 0.31
        piece_rect = QRectF(center.x() - radius, center.y() - radius, radius * 2, radius * 2)

        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(39, 27, 18, 80))
        painter.drawEllipse(piece_rect.translated(cell * 0.035, cell * 0.045))

        fill = QRadialGradient(piece_rect.center(), radius)
        fill.setColorAt(0.0, QColor("#fffdf4"))
        fill.setColorAt(0.72, QColor("#f7f0df"))
        fill.setColorAt(1.0, QColor("#d7c7a8"))
        painter.setBrush(fill)
        painter.setPen(QPen(QColor("#92794f"), 1.5))
        painter.drawEllipse(piece_rect)

        accent = QColor("#b94133") if side == self.RED_SIDE else QColor("#294f9f")
        ring = QConicalGradient(piece_rect.center(), -90)
        ring.setColorAt(0.0, accent.lighter(135))
        ring.setColorAt(0.45, accent)
        ring.setColorAt(1.0, accent.darker(120))
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.setPen(QPen(accent, max(2, int(cell * 0.04))))
        painter.drawEllipse(piece_rect.adjusted(cell * 0.045, cell * 0.045, -cell * 0.045, -cell * 0.045))

        if self.selected == (x, y):
            painter.setPen(QPen(QColor("#6b35d8"), max(2, int(cell * 0.045))))
            painter.drawEllipse(piece_rect.adjusted(-3, -3, 3, 3))

        text = self.PIECE_TEXT.get((side, kind), label)
        font = QFont("Malgun Gothic", max(15, int(cell * 0.32)))
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(accent.darker(112))

        text_path = QPainterPath()
        metrics_rect = painter.fontMetrics().boundingRect(text)
        text_x = center.x() - metrics_rect.width() / 2
        text_y = center.y() + metrics_rect.height() * 0.34
        text_path.addText(QPointF(text_x, text_y), font, text)
        painter.setPen(QPen(QColor(255, 255, 255, 145), 2))
        painter.drawPath(text_path)
        painter.fillPath(text_path, accent.darker(112))
