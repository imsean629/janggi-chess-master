/* 체스 마스터 — UI. 규칙/탐색은 chess-engine.js, 무거운 탐색은 Web Worker에서 실행한다. */
(function () {
  'use strict';

  const E = createChessEngine();                  // 화면용(규칙·합법 수·표기) 인스턴스
  const { MATE, MAXPLY, START_FEN, QUEEN, ROOK, BISHOP, KNIGHT, KING } = E;
  const $ = id => document.getElementById(id);
  const VS = '︎';                              // 이모지가 아닌 글자 모양으로 표시
  const SOLID = ['', '♟', '♞', '♝', '♜', '♛', '♚'];
  const OUTLINE = ['', '♙', '♘', '♗', '♖', '♕', '♔'];
  const FIG = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };
  const SAVE_KEY = 'chess-master-v1';

  const SQ = 60;                                    // 보드 한 칸 크기 (viewBox 480)

  const S = {
    me: 1, startMode: 'std', startFen: START_FEN, timeMs: 3000, pv: 3, showOpp: false,
    flipped: false, moves: [],
    sel: -1, legal: [], check: false, over: null, info: '',
    job: 0, thinking: false, analysis: null, analysisSide: 0, pendingPromo: null,
  };

  // ------------------------------------------------------------------ 표기
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const figHtml = san => esc(san).replace(/[KQRBN]/g, ch => `<span class="fig">${FIG[ch]}${VS}</span>`);
  function pvSans(pv) {                             // 현재 국면에서 수순을 차례로 두어 보며 표기
    const out = []; let made = 0;
    for (const m of pv) { out.push(E.san(m)); E.make(m); made++; }
    while (made--) E.undo();
    return out;
  }
  function fmtScore(score) {
    if (Math.abs(score) > MATE - MAXPLY) {
      const n = Math.ceil((MATE - Math.abs(score)) / 2);
      return { label: score > 0 ? `${n}수 메이트` : `${n}수 후 메이트 당함`, cls: score > 0 ? 'pos' : 'neg' };
    }
    const v = score / 100;
    return { label: (v > 0 ? '+' : '') + v.toFixed(1), cls: v > 0.3 ? 'pos' : v < -0.3 ? 'neg' : '' };
  }
  const whitePct = (score, side) => {
    const ws = side === 1 ? score : -score;
    if (Math.abs(ws) > MATE - MAXPLY) return ws > 0 ? 100 : 0;
    return Math.round(50 + 50 * Math.tanh(ws / 500));
  };
  const firstMoveNo = () => parseInt(S.startFen.split(/\s+/)[5], 10) || 1;
  const startsBlack = () => S.startFen.split(/\s+/)[1] === 'b';

  // ------------------------------------------------------------------ 게임 진행
  function newGame() {
    E.setFen(S.startFen);
    S.moves = []; S.sel = -1; S.flipped = S.me === -1;
    afterChange();
  }
  function replay(moves) {
    E.setFen(S.startFen);
    S.moves = [];
    for (const m of moves) {
      if (!E.legalMoves().includes(m)) break;
      const side = E.getSide(), san = E.san(m);
      E.make(m); S.moves.push({ m, san, side });
    }
    S.sel = -1; S.flipped = S.me === -1;
    afterChange();
  }
  function play(m) {
    const side = E.getSide(), san = E.san(m);
    E.make(m);
    S.moves.push({ m, san, side });
    S.sel = -1;
    afterChange();
  }
  function undoMove() {
    if (!S.moves.length) return;
    E.undo(); S.moves.pop(); S.sel = -1;
    afterChange();
  }
  function afterChange() {
    const side = E.getSide();
    S.legal = E.legalMoves();
    S.check = E.inCheck(side);
    S.over = null; S.info = '';
    if (!S.legal.length) S.over = S.check ? { kind: 'mate', winner: -side } : { kind: 'stalemate' };
    else if (E.insufficient()) S.over = { kind: 'material' };
    else if (E.repetitions() >= 3) S.info = '3회 반복 (무승부 요청 가능)';
    else if (E.getHalf() >= 100) S.info = '50수 규칙 (무승부 요청 가능)';
    save();
    render(); renderPanels();
    requestAnalysis();
  }

  function onSquare(sq) {
    if (S.over) return;
    const b = E.getBoard(), p = b[sq], side = E.getSide();
    if (S.sel >= 0) {
      const cands = S.legal.filter(m => (m & 127) === S.sel && ((m >> 7) & 127) === sq);
      if (cands.length === 1) { play(cands[0]); return; }
      if (cands.length > 1) { askPromotion(cands); return; }
    }
    S.sel = (p * side > 0 && sq !== S.sel) ? sq : -1;
    render();
  }

  function askPromotion(cands) {
    const side = E.getSide();
    S.pendingPromo = cands;
    $('promo-row').innerHTML = [QUEEN, ROOK, BISHOP, KNIGHT].map(t =>
      `<button type="button" data-promo="${t}" class="${side === 1 ? 'pw' : 'pb'}" aria-label="${['', '', '나이트', '비숍', '룩', '퀸'][t]}">${side === 1 ? OUTLINE[t] : SOLID[t]}${VS}</button>`).join('');
    $('dlg-promo').showModal();
  }

  // ------------------------------------------------------------------ 분석 (Web Worker)
  function workerBody() {
    const Eng = createChessEngine();
    self.onmessage = ev => {
      const d = ev.data;
      Eng.setFen(d.fen);
      for (const m of d.moves) Eng.make(m);
      const res = Eng.search({
        timeMs: d.timeMs, multiPV: d.multiPV,
        onProgress: p => self.postMessage({ type: 'progress', res: p }),
      });
      self.postMessage({ type: 'done', res });
    };
  }
  let workerUrl = null, worker = null, fallbackEngine = null, workerBroken = false;
  function makeWorker() {
    if (!workerUrl) {
      const src = 'const createChessEngine=' + createChessEngine.toString() + ';(' + workerBody.toString() + ')();';
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    return new Worker(workerUrl);
  }
  function stopAnalysis() {
    S.job++;
    if (worker) { worker.terminate(); worker = null; }
  }
  function requestAnalysis() {
    stopAnalysis();
    S.analysis = null; S.thinking = false;
    const side = E.getSide();
    if (S.over || !(side === S.me || S.showOpp) || !S.legal.length) { renderPanels(); return; }
    const id = S.job;
    S.thinking = true; S.analysisSide = side;
    const payload = { fen: S.startFen, moves: S.moves.map(x => x.m), timeMs: S.timeMs, multiPV: Math.min(S.pv, S.legal.length) };
    const onRes = (res, done) => {
      if (id !== S.job) return;
      S.analysis = res; if (done) { S.thinking = false; if (worker) { worker.terminate(); worker = null; } }
      renderPanels(); render();
    };
    if (!workerBroken) {
      try {
        worker = makeWorker();
        worker.onmessage = ev => onRes(ev.data.res, ev.data.type === 'done');
        worker.onerror = () => { workerBroken = true; if (id === S.job) requestAnalysis(); };
        worker.postMessage(payload);
        renderPanels();
        return;
      } catch (e) { workerBroken = true; }
    }
    // 대체 경로: Worker를 못 쓰는 환경에서는 화면이 잠시 멈추더라도 메인 스레드에서 계산
    renderPanels();
    setTimeout(() => {
      if (id !== S.job) return;
      fallbackEngine = fallbackEngine || createChessEngine();
      fallbackEngine.setFen(payload.fen);
      for (const m of payload.moves) fallbackEngine.make(m);
      onRes(fallbackEngine.search(payload), true);
    }, 40);
  }

  // ------------------------------------------------------------------ 그리기
  const colOf = sq => (S.flipped ? 7 - (sq & 7) : sq & 7);
  const rowOf = sq => (S.flipped ? sq >> 4 : 7 - (sq >> 4));
  const center = sq => [colOf(sq) * SQ + SQ / 2, rowOf(sq) * SQ + SQ / 2];

  function arrowSvg(from, to, rank) {
    const [x1, y1] = center(from), [x2, y2] = center(to);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const w = rank === 1 ? 9 : 6, head = rank === 1 ? 22 : 16;
    const sx = x1 + ux * 12, sy = y1 + uy * 12, ex = x2 - ux * 4, ey = y2 - uy * 4;
    const bx = ex - ux * head, by = ey - uy * head, nx = -uy, ny = ux;
    const op = rank === 1 ? 0.85 : 0.55;
    return `<g class="arrow arrow-${rank}" opacity="${op}">` +
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${(bx + nx * head * .6).toFixed(1)},${(by + ny * head * .6).toFixed(1)} ${(bx - nx * head * .6).toFixed(1)},${(by - ny * head * .6).toFixed(1)}" stroke="none"/></g>`;
  }

  function render() {
    const b = E.getBoard(), side = E.getSide();
    let h = '';
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f, light = (r + f) % 2 === 1;
      h += `<rect class="${light ? 'sq-l' : 'sq-d'}" x="${colOf(sq) * SQ}" y="${rowOf(sq) * SQ}" width="${SQ}" height="${SQ}"/>`;
    }
    for (let i = 0; i < 8; i++) {                   // 좌표: 아래 줄에 파일, 왼쪽 줄에 랭크
      const f = S.flipped ? 7 - i : i, r = S.flipped ? i : 7 - i;
      h += `<text class="coord ${(f + (S.flipped ? 7 : 0)) % 2 === 0 ? 'on-d' : 'on-l'}" x="${i * SQ + SQ - 4}" y="${8 * SQ - 4}" text-anchor="end">${'abcdefgh'[f]}</text>`;
      h += `<text class="coord ${(r + (S.flipped ? 7 : 0)) % 2 === 0 ? 'on-d' : 'on-l'}" x="3" y="${i * SQ + 12}">${r + 1}</text>`;
    }
    const last = S.moves.length ? S.moves[S.moves.length - 1].m : null;
    if (last !== null) for (const sq of [last & 127, (last >> 7) & 127]) h += `<rect class="hl-last" x="${colOf(sq) * SQ}" y="${rowOf(sq) * SQ}" width="${SQ}" height="${SQ}"/>`;
    if (S.sel >= 0) h += `<rect class="hl-sel-sq" x="${colOf(S.sel) * SQ}" y="${rowOf(S.sel) * SQ}" width="${SQ}" height="${SQ}"/>`;
    if (S.check) {
      const k = b.findIndex(p => p === side * KING);
      if (k >= 0) { const [cx, cy] = center(k); h += `<circle class="hl-check-c" cx="${cx}" cy="${cy}" r="29"/>`; }
    }
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue;
      const t = Math.abs(p), [cx, cy] = center(sq);
      if (p > 0) h += `<text class="pc pc-wf" x="${cx}" y="${cy}">${SOLID[t]}${VS}</text><text class="pc pc-wl" x="${cx}" y="${cy}">${OUTLINE[t]}${VS}</text>`;
      else h += `<text class="pc pc-b" x="${cx}" y="${cy}">${SOLID[t]}${VS}</text>`;
    }
    if (S.sel >= 0) {
      const seen = new Set();
      for (const m of S.legal) {
        if ((m & 127) !== S.sel) continue;
        const t = (m >> 7) & 127; if (seen.has(t)) continue; seen.add(t);
        const [cx, cy] = center(t);
        h += b[t] || ((m >> 17) & E.F_EP) ? `<circle class="hl-cap-c" cx="${cx}" cy="${cy}" r="27"/>` : `<circle class="hl-dot-c" cx="${cx}" cy="${cy}" r="9"/>`;
      }
    }
    const an = S.analysis;
    if (an && an.lines.length && S.analysisSide === side && !S.over) {
      for (let i = an.lines.length - 1; i >= 0; i--) {
        const m = an.lines[i].move;
        h += arrowSvg(m & 127, (m >> 7) & 127, i + 1);
        if (i > 0) { const [cx, cy] = center((m >> 7) & 127); h += `<g class="badge-n"><circle cx="${cx + 19}" cy="${cy - 19}" r="10" class="arrow-${i + 1}"/><text x="${cx + 19}" y="${cy - 18}">${i + 1}</text></g>`; }
      }
    }
    $('board').innerHTML = h;
  }

  function renderPanels() {
    const side = E.getSide(), mine = side === S.me;
    const tb = $('turnbar');
    tb.className = 'turnbar ' + (side === 1 ? 'w' : 'b');
    const badge = $('turn-badge');
    badge.hidden = false; badge.className = 'badge';
    if (S.over) {
      $('turn-text').textContent = S.over.kind === 'mate' ? `${S.over.winner === 1 ? '백' : '흑'} 승리` : '무승부';
      badge.className = 'badge end';
      badge.textContent = S.over.kind === 'mate' ? '체크메이트' : S.over.kind === 'stalemate' ? '스테일메이트' : '기물 부족';
    } else {
      $('turn-text').textContent = `${side === 1 ? '백' : '흑'} 차례 · ${mine ? '내 수' : '상대 수'}`;
      if (S.check) badge.textContent = '체크!';
      else if (S.info) { badge.className = 'badge info'; badge.textContent = S.info; }
      else badge.hidden = true;
    }
    $('btn-undo').disabled = !S.moves.length;

    // 기보: 한 줄에 수 번호 · 백 · 흑
    $('hist-count').textContent = S.moves.length ? `(${S.moves.length}수)` : '';
    let rows = '', no = firstMoveNo(), i = 0;
    if (startsBlack() && S.moves.length) { rows += `<li><span class="n">${no}.</span><span>…</span><span>${figHtml(S.moves[0].san)}</span></li>`; i = 1; no++; }
    for (; i < S.moves.length; i += 2, no++) {
      rows += `<li><span class="n">${no}.</span><span>${figHtml(S.moves[i].san)}</span><span>${S.moves[i + 1] ? figHtml(S.moves[i + 1].san) : ''}</span></li>`;
    }
    $('history').innerHTML = rows;

    renderReco(side, mine);
  }

  function renderReco(side, mine) {
    const el = $('reco'), an = S.analysis;
    let h = '';
    if (S.over) {
      const msg = S.over.kind === 'mate' ? (S.over.winner === S.me ? '내가 이겼어요!' : '상대가 이겼어요.')
        : S.over.kind === 'stalemate' ? '둘 수 있는 수가 없지만 체크가 아니라 무승부예요.' : '양쪽 모두 메이트할 기물이 부족해 무승부예요.';
      h = `<div class="title"><h2>대국 종료</h2></div><p class="msg">${msg} 잘못 입력했다면 <b>무르기</b>로 고칠 수 있어요.</p>`;
    } else if (!mine && !S.showOpp) {
      h = `<div class="title"><h2>상대(${side === 1 ? '백' : '흑'}) 차례</h2></div><p class="msg">실제 대국에서 상대가 둔 수를 그대로 입력하세요. <b>상대 기물을 누르고 → 도착 칸</b>을 누르면 됩니다. 캐슬링은 킹을 두 칸 옮기면 돼요.</p>`;
    } else {
      const label = mine ? '내 추천 수' : '상대 예상 수';
      h += `<div class="title"><h2>${label}</h2><span class="meta">${S.thinking ? '<span class="spinner"></span>생각 중' : '완료'}${an && an.depth ? ` · ${an.depth}수 깊이 · ${(an.nodes / 1000 | 0).toLocaleString()}k노드` : ''}</span></div>`;
      if (!an || !an.lines.length) {
        h += `<p class="msg">${S.thinking ? '국면을 분석하고 있어요…' : '추천할 수가 없어요.'}</p>`;
      } else {
        const pct = whitePct(an.lines[0].score, side);
        h += `<div class="evalbar chess-eval" title="백 기준 평가 ${pct}%"><i style="width:${pct}%"></i></div>`;
        an.lines.forEach((ln, i) => {
          const sans = pvSans(ln.pv), sc = fmtScore(ln.score);
          const rest = sans.slice(1, 7);
          h += `<div class="cand ${i === 0 ? 'best' : ''}"><span class="rank">${i + 1}</span><span class="mv">${figHtml(sans[0])}</span><span class="score ${sc.cls}">${sc.label}</span>` +
            (rest.length ? `<span class="pv">이후: ${rest.map(figHtml).join(' ')}</span>` : '<span class="pv"></span>') +
            `<span class="play"><button type="button" data-play="${ln.move}">${i === 0 ? '추천대로 두기' : '이 수 두기'}</button></span></div>`;
        });
      }
    }
    el.innerHTML = h;
  }

  // ------------------------------------------------------------------ 내보내기
  function pgn() {
    const res = S.over ? (S.over.kind === 'mate' ? (S.over.winner === 1 ? '1-0' : '0-1') : '1/2-1/2') : '*';
    const d = new Date(), date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    let head = `[Event "체스 마스터"]\n[Date "${date}"]\n[White "${S.me === 1 ? '나' : '상대'}"]\n[Black "${S.me === -1 ? '나' : '상대'}"]\n[Result "${res}"]\n`;
    if (S.startFen !== START_FEN) head += `[SetUp "1"]\n[FEN "${S.startFen}"]\n`;
    let body = '', no = firstMoveNo(), i = 0;
    if (startsBlack() && S.moves.length) { body += `${no}... ${S.moves[0].san} `; i = 1; no++; }
    for (; i < S.moves.length; i += 2, no++) body += `${no}. ${S.moves[i].san} ${S.moves[i + 1] ? S.moves[i + 1].san + ' ' : ''}`;
    return head + '\n' + body + res + '\n';
  }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
  }
  function copy(text, label) {
    const fallback = () => window.prompt(`${label}을(를) 복사하세요`, text);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(`${label} 복사했어요`), fallback);
    else fallback();
  }

  // ------------------------------------------------------------------ 저장/복원
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ me: S.me, startFen: S.startFen, timeMs: S.timeMs, pv: S.pv, showOpp: S.showOpp, moves: S.moves.map(x => x.m) }));
    } catch (e) { /* 저장소를 못 써도 대국에는 지장 없음 */ }
  }
  const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } };

  // ------------------------------------------------------------------ 설정 화면
  function segBind(id, cb) {
    const root = $(id);
    root.addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-v]'); if (!btn) return;
      root.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', b === btn); });
      cb(btn.dataset.v);
    });
  }
  function markSeg(id, v) { $(id).querySelectorAll('button').forEach(b => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); }
  function showScreen(name) { $('setup').hidden = name !== 'setup'; $('game').hidden = name !== 'game'; window.scrollTo(0, 0); }

  function start() {
    if (S.startMode === 'fen') {
      const fen = $('fen-input').value.trim(), msg = $('fen-msg');
      const probe = createChessEngine();
      if (!fen || !probe.setFen(fen)) {
        msg.textContent = 'FEN을 읽을 수 없어요. 킹이 각각 하나씩 있고, 둘 차례가 아닌 쪽이 체크 상태가 아닌지 확인해 주세요.';
        msg.classList.add('err'); return;
      }
      msg.classList.remove('err');
      S.startFen = probe.getFen();
    } else S.startFen = START_FEN;
    showScreen('game'); newGame();
  }

  function init() {
    segBind('seg-me', v => { S.me = +v; });
    segBind('seg-start', v => { S.startMode = v; $('fen-box').hidden = v !== 'fen'; if (v === 'fen') $('fen-input').focus(); });
    segBind('seg-time', v => { S.timeMs = +v; });
    $('btn-start').addEventListener('click', start);
    const saved = load();
    if (saved && saved.moves && saved.moves.length) {
      $('btn-resume').hidden = false;
      $('btn-resume').textContent = `이어서 두기 (${saved.moves.length}수 · 내 색 ${saved.me === 1 ? '백' : '흑'})`;
      $('btn-resume').addEventListener('click', () => {
        Object.assign(S, { me: saved.me, startFen: saved.startFen || START_FEN, timeMs: saved.timeMs || 3000, pv: saved.pv || 3, showOpp: !!saved.showOpp });
        syncSettingsUI(); showScreen('game'); replay(saved.moves);
      });
    }

    $('board').addEventListener('click', ev => {
      const r = $('board').getBoundingClientRect();
      const col = Math.floor((ev.clientX - r.left) * 8 / r.width), row = Math.floor((ev.clientY - r.top) * 8 / r.height);
      if (col < 0 || col > 7 || row < 0 || row > 7) return;
      const f = S.flipped ? 7 - col : col, rank = S.flipped ? row : 7 - row;
      onSquare(rank * 16 + f);
    });
    $('reco').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-play]'); if (!b || S.over) return;
      const m = +b.dataset.play; if (S.legal.includes(m)) play(m);
    });
    $('promo-row').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-promo]'); if (!b || !S.pendingPromo) return;
      const m = S.pendingPromo.find(x => ((x >> 14) & 7) === +b.dataset.promo);
      S.pendingPromo = null; $('dlg-promo').close();
      if (m !== undefined) play(m);
    });
    $('dlg-promo').addEventListener('click', ev => {   // 취소 버튼
      if (!ev.target.closest('button[value="cancel"]')) return;
      ev.preventDefault(); $('dlg-promo').close();
      S.pendingPromo = null; S.sel = -1; render();
    });
    $('dlg-promo').addEventListener('cancel', () => { S.pendingPromo = null; S.sel = -1; render(); });   // Esc
    $('btn-undo').addEventListener('click', undoMove);
    $('btn-flip').addEventListener('click', () => { S.flipped = !S.flipped; render(); });
    $('btn-menu').addEventListener('click', () => $('dlg-menu').showModal());
    $('dlg-menu').addEventListener('click', ev => {   // close 이벤트는 화면이 그려질 때까지 늦어질 수 있어 클릭에서 바로 처리
      const btn = ev.target.closest('button[value]'); if (!btn) return;
      ev.preventDefault(); $('dlg-menu').close();
      const v = btn.value;
      if (v === 'new') { stopAnalysis(); showScreen('setup'); }
      else if (v === 'restart') { showScreen('game'); newGame(); }
      else if (v === 'fen') copy(E.getFen(), 'FEN');
      else if (v === 'pgn') copy(pgn(), '기보(PGN)');
      else if (v === 'home') { stopAnalysis(); location.href = 'index.html'; }
    });
    $('sel-time').addEventListener('change', e => { S.timeMs = +e.target.value; save(); requestAnalysis(); });
    $('sel-pv').addEventListener('change', e => { S.pv = +e.target.value; save(); requestAnalysis(); });
    $('chk-opp').addEventListener('change', e => { S.showOpp = e.target.checked; save(); requestAnalysis(); });
    syncSettingsUI();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  function syncSettingsUI() {
    $('sel-time').value = String(S.timeMs); $('sel-pv').value = String(S.pv); $('chk-opp').checked = S.showOpp;
    markSeg('seg-me', S.me); markSeg('seg-time', S.timeMs);
  }

  init();
  window.__chess = { S, E, stop: stopAnalysis };   // 디버깅용 + 한 파일 버전에서 화면을 떠날 때 계산 중지
})();
