from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QComboBox, QFileDialog, QHBoxLayout, QLabel, QListWidget, QListWidgetItem, QMainWindow, QPushButton, QPlainTextEdit, QVBoxLayout, QWidget

from janggi_helper.data.presets import LAYOUT_OPTIONS
from janggi_helper.services.game_service import GameService
from janggi_helper.ui.board_widget import BoardWidget
from janggi_helper.ui.dialogs import show_error, show_info


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("한국 장기 수 추천기")
        self.resize(1240, 760)
        self.game_service = GameService()
        self.board_widget = BoardWidget()
        self.board_widget.cell_clicked.connect(self.on_board_cell_clicked)

        self.status_label = QLabel()
        self.last_move_label = QLabel()
        self.evaluation_label = QLabel()
        self.setup_status_label = QLabel()
        self.recommendation_list = QListWidget()
        self.move_history_list = QListWidget()
        self.setup_mode_button = QPushButton("배치 편집 시작")
        self.setup_side_combo = QComboBox()
        self.setup_piece_combo = QComboBox()
        self.turn_combo = QComboBox()
        self.red_layout_combo = QComboBox()
        self.blue_layout_combo = QComboBox()

        self._build_ui()
        self.refresh_ui()

    def _build_ui(self) -> None:
        container = QWidget()
        self.setCentralWidget(container)

        root_layout = QVBoxLayout()
        root_layout.setContentsMargins(16, 16, 16, 16)
        root_layout.setSpacing(12)
        container.setLayout(root_layout)

        layout_picker = QWidget()
        layout_picker.setStyleSheet("QWidget { background: #fff6df; border: 1px solid #d8b977; border-radius: 8px; }")
        layout_picker_row = QHBoxLayout()
        layout_picker_row.setContentsMargins(12, 8, 12, 8)
        layout_picker_row.setSpacing(10)
        layout_picker.setLayout(layout_picker_row)

        red_layout_label = QLabel("빨간색 배치")
        blue_layout_label = QLabel("파란색 배치")
        self.red_layout_combo.addItems(list(LAYOUT_OPTIONS))
        self.blue_layout_combo.addItems(list(LAYOUT_OPTIONS))
        for widget in (red_layout_label, blue_layout_label):
            widget.setStyleSheet("QLabel { border: none; background: transparent; font-size: 13px; font-weight: 700; }")
        for combo in (self.red_layout_combo, self.blue_layout_combo):
            combo.currentTextChanged.connect(self.on_initial_layout_changed)
            combo.setStyleSheet("QComboBox { background: white; border: 1px solid #caa35b; border-radius: 6px; padding: 6px; font-size: 13px; }")
            combo.setMinimumWidth(130)
        layout_picker_row.addWidget(red_layout_label)
        layout_picker_row.addWidget(self.red_layout_combo)
        layout_picker_row.addSpacing(12)
        layout_picker_row.addWidget(blue_layout_label)
        layout_picker_row.addWidget(self.blue_layout_combo)
        layout_picker_row.addStretch(1)
        root_layout.addWidget(layout_picker)

        top_panel = QPlainTextEdit()
        top_panel.setReadOnly(True)
        top_panel.setFixedHeight(56)
        top_panel.setPlainText("현재 장기판 상태를 수동으로 입력한 뒤 추천 수를 확인하세요.")
        top_panel.setStyleSheet("QPlainTextEdit { background: #fffaf0; border: 1px solid #d5c2a1; border-radius: 8px; font-size: 14px; }")
        root_layout.addWidget(top_panel)

        content_layout = QHBoxLayout()
        content_layout.setSpacing(16)
        root_layout.addLayout(content_layout, stretch=1)
        content_layout.addWidget(self.board_widget, stretch=3)

        info_panel = QWidget()
        info_panel.setFixedWidth(360)
        info_panel.setStyleSheet("QWidget { background: #fffaf2; border: 1px solid #e3d1b5; border-radius: 10px; }")
        info_layout = QVBoxLayout()
        info_layout.setSpacing(8)
        info_panel.setLayout(info_layout)

        for widget in (self.status_label, self.last_move_label, self.evaluation_label, self.setup_status_label):
            widget.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
            widget.setStyleSheet("QLabel { font-size: 14px; padding: 6px; border: none; background: transparent; }")
            info_layout.addWidget(widget)

        setup_row = QHBoxLayout()
        self.setup_mode_button.clicked.connect(self.on_toggle_setup_mode)
        self.setup_mode_button.setMinimumHeight(36)
        self.setup_side_combo.addItems(["초", "한"])
        self.setup_side_combo.currentTextChanged.connect(self.on_setup_piece_changed)
        self.setup_piece_combo.addItems(["차", "마", "상", "사", "장", "포", "졸", "지우기"])
        self.setup_piece_combo.currentTextChanged.connect(self.on_setup_piece_changed)
        self.turn_combo.addItems(["초", "한"])
        self.turn_combo.currentTextChanged.connect(self.on_turn_changed)
        for widget in (self.setup_mode_button, self.setup_side_combo, self.setup_piece_combo, self.turn_combo):
            widget.setStyleSheet(
                "QPushButton, QComboBox { background: white; border: 1px solid #d0ba95; border-radius: 6px; padding: 6px; font-size: 13px; }"
            )
        setup_row.addWidget(self.setup_mode_button, stretch=2)
        setup_row.addWidget(self.setup_side_combo, stretch=1)
        setup_row.addWidget(self.setup_piece_combo, stretch=1)
        info_layout.addLayout(setup_row)

        turn_hint = QLabel("배치 편집 중에는 진영과 기물을 골라 보드에 직접 배치할 수 있습니다. 마지막 칸은 다음 턴 선택입니다.")
        turn_hint.setWordWrap(True)
        turn_hint.setStyleSheet("QLabel { font-size: 12px; color: #6f5a3e; padding: 4px 6px 10px 6px; border: none; background: transparent; }")
        info_layout.addWidget(turn_hint)

        recommendation_title = QLabel("추천 수 Top 3")
        recommendation_title.setStyleSheet("QLabel { font-size: 15px; font-weight: 700; padding: 6px; border: none; background: transparent; }")
        info_layout.addWidget(recommendation_title)
        self.recommendation_list.setStyleSheet("QListWidget { font-size: 13px; background: white; }")
        info_layout.addWidget(self.recommendation_list, stretch=1)

        record_title = QLabel("수순 기록")
        record_title.setStyleSheet("QLabel { font-size: 15px; font-weight: 700; padding: 6px; border: none; background: transparent; }")
        info_layout.addWidget(record_title)
        self.move_history_list.setStyleSheet("QListWidget { font-size: 13px; background: white; }")
        info_layout.addWidget(self.move_history_list, stretch=2)
        content_layout.addWidget(info_panel, stretch=2)

        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)
        root_layout.addLayout(button_layout)
        for text, handler in [
            ("초기 배치", self.on_load_initial),
            ("판 초기화", self.on_clear_board),
            ("한 수 되돌리기", self.on_undo),
            ("추천 수 보기", self.on_refresh_recommendation),
            ("현재 상태 저장", self.on_save),
            ("저장 상태 불러오기", self.on_load),
        ]:
            button = QPushButton(text)
            button.clicked.connect(handler)
            button.setMinimumHeight(40)
            button.setStyleSheet(
                """
                QPushButton {
                    background: #efe0be;
                    border: 1px solid #b79662;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 700;
                    padding: 8px 14px;
                }
                QPushButton:hover {
                    background: #f6ebd2;
                }
                """
            )
            button_layout.addWidget(button)

    def refresh_ui(self) -> None:
        view_state = self.game_service.build_view_state()
        self.status_label.setText(view_state.current_turn_text)
        self.last_move_label.setText(view_state.last_move_text)
        self.evaluation_label.setText(view_state.evaluation_text)
        self.setup_status_label.setText(view_state.setup_text)
        self.setup_mode_button.setText("배치 편집 종료" if view_state.setup_mode else "배치 편집 시작")
        self.turn_combo.blockSignals(True)
        self.turn_combo.setCurrentText(self.game_service.board.turn)
        self.turn_combo.blockSignals(False)

        labels = {(x, y): self.game_service.get_piece_label(x, y) for y in range(10) for x in range(9)}
        self.board_widget.update_board(labels, view_state.selected_pos, view_state.legal_targets, view_state.last_move_cells)

        self.recommendation_list.clear()
        for line in view_state.recommendation_lines:
            self.recommendation_list.addItem(QListWidgetItem(line))

        self.move_history_list.clear()
        for line in view_state.move_records:
            self.move_history_list.addItem(QListWidgetItem(line))

    def on_board_cell_clicked(self, x: int, y: int) -> None:
        changed, message = self.game_service.handle_cell_click(x, y)
        if message:
            show_error(self, "입력 안내", message)
        if changed:
            self.refresh_ui()

    def on_toggle_setup_mode(self) -> None:
        _, message = self.game_service.toggle_setup_mode()
        self.refresh_ui()
        show_info(self, "배치 편집", message)

    def on_setup_piece_changed(self) -> None:
        self.game_service.set_setup_piece(self.setup_side_combo.currentText(), self.setup_piece_combo.currentText())
        self.refresh_ui()

    def on_turn_changed(self, turn: str) -> None:
        self.game_service.set_turn(turn)
        self.refresh_ui()

    def on_initial_layout_changed(self) -> None:
        self.game_service.set_initial_layouts(self.red_layout_combo.currentText(), self.blue_layout_combo.currentText())

    def on_load_initial(self) -> None:
        self.game_service.set_initial_layouts(self.red_layout_combo.currentText(), self.blue_layout_combo.currentText())
        self.game_service.load_initial_board()
        self.refresh_ui()
        show_info(self, "초기 배치", "선택한 마/상 배치로 시작 배치를 불러왔습니다.")

    def on_clear_board(self) -> None:
        self.game_service.clear_board()
        self.refresh_ui()
        show_info(self, "판 초기화", "빈 보드로 초기화했습니다.")

    def on_undo(self) -> None:
        success, message = self.game_service.undo()
        if success:
            self.refresh_ui()
            show_info(self, "되돌리기", message)
        else:
            show_error(self, "되돌리기", message)

    def on_refresh_recommendation(self) -> None:
        self.refresh_ui()
        if self.game_service.setup_mode:
            show_info(self, "추천 수", "배치 편집 모드를 종료하면 추천 수를 계산합니다.")
        else:
            show_info(self, "추천 수", "현재 추천 수를 계산했습니다.")

    def on_save(self) -> None:
        file_path, _ = QFileDialog.getSaveFileName(self, "현재 상태 저장", "", "JSON 파일 (*.json)")
        if not file_path:
            return
        try:
            self.game_service.save_state(file_path)
            show_info(self, "저장 완료", "현재 상태를 저장했습니다.")
        except Exception as exc:
            print(f"저장 실패: {exc}")
            show_error(self, "저장 실패", "저장 중 오류가 발생했습니다.")

    def on_load(self) -> None:
        file_path, _ = QFileDialog.getOpenFileName(self, "저장 상태 불러오기", "", "JSON 파일 (*.json)")
        if not file_path:
            return
        try:
            self.game_service.load_state(file_path)
            self.refresh_ui()
            show_info(self, "불러오기 완료", "저장 상태를 불러왔습니다.")
        except ValueError as exc:
            print(f"불러오기 실패: {exc}")
            show_error(self, "불러오기 실패", str(exc))
        except Exception as exc:
            print(f"불러오기 실패: {exc}")
            show_error(self, "불러오기 실패", "불러오기 중 오류가 발생했습니다.")
