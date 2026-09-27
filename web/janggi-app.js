/* 장기 마스터 — UI. 규칙/탐색은 engine.js, 무거운 탐색은 Web Worker에서 실행한다. */
(function () {
  'use strict';

  const E = createEngine();                      // 화면용(규칙·합법 수) 인스턴스
  const { PASS, MATE, MAXPLY } = E;
  const $ = id => document.getElementById(id);
  const NAME = ['', '궁', '사', '상', '마', '차', '포', '졸'];
  const GLYPH = { 1: ['', '楚', '士', '象', '馬', '車', '包', '卒'], '-1': ['', '漢', '士', '象', '馬', '車', '包', '兵'] };
  const RADIUS = [0, 26, 20, 22, 22, 24, 24, 17];
  const SAVE_KEY = 'janggi-master-v1';

  // 보드 기하
  const CELL = 56, MX = 36, MY = 36;
  const px = vx => MX + vx * CELL, py = vy => MY + vy * CELL;

  const S = {
    me: 1, choForm: 0, hanForm: 0, timeMs: 3000, pv: 3, showOpp: false,
    flipped: false, startBoard: null, moves: [],
    sel: -1, legal: [], check: false, over: null,
    job: 0, thinking: false, analysis: null, analysisSide: 0,
  };

  // ------------------------------------------------------------------ 표기
  const pieceName = p => (Math.abs(p) === 7 ? (p > 0 ? '졸' : '병') : NAME[Math.abs(p)]);
  const coord = s => `(${(s % 9) + 1},${((s / 9) | 0) + 1})`;
  function describe(m, withCap) {
    if (m === PASS) return { text: '한수쉼', cap: '' };
    const b = E.getBoard(), f = m & 127, t = m >> 7;
    return { text: `${pieceName(b[f])} ${coord(f)}→${coord(t)}`, cap: b[t] && withCap !== false ? `×${pieceName(b[t])}` : '' };
  }
  function pvText(pv) {                            // 현재 국면에서 수순을 차례로 두어 보며 표기
    const out = []; let made = 0;
    for (const m of pv) {
      const d = describe(m); out.push(d.text + (d.cap ? ' ' + d.cap : ''));
      E.make(m); made++;
    }
    while (made--) E.undo();
    return out;
  }
  function fmtScore(score) {
    if (Math.abs(score) > MATE - MAXPLY) {
      const n = Math.ceil((MATE - Math.abs(score)) / 2);
      return { label: score > 0 ? `${n}수 외통` : `${n}수 후 외통 위험`, cls: score > 0 ? 'pos' : 'neg' };
    }
    const v = score / 100;
    return { label: (v > 0 ? '+' : '') + v.toFixed(1), cls: v > 0.3 ? 'pos' : v < -0.3 ? 'neg' : '' };
  }
  const winPct = score => Math.round(50 + 50 * Math.tanh(score / 900));

  // ------------------------------------------------------------------ 게임 진행
  function newGame() {
    S.startBoard = E.makeStart(S.choForm, S.hanForm);
    E.setPosition(S.startBoard, 1);
    S.moves = []; S.sel = -1; S.over = null; S.flipped = S.me === -1;
    afterChange();
  }
  function replay(moves) {
    S.startBoard = E.makeStart(S.choForm, S.hanForm);
    E.setPosition(S.startBoard, 1);
    S.moves = [];
    for (const m of moves) {
      if (m !== PASS && !E.legalMoves().includes(m)) break;
      const mover = E.getSide(), d = describe(m);
      E.make(m); S.moves.push({ m, text: d.text + (d.cap ? ' ' + d.cap : ''), side: mover });
    }
    S.sel = -1; S.flipped = S.me === -1;
    afterChange();
  }
  function play(m) {
    const mover = E.getSide(), d = describe(m);
    E.make(m);
    S.moves.push({ m, text: d.text + (d.cap ? ' ' + d.cap : ''), side: mover });
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
    S.over = null;
    if (!S.legal.length && S.check) S.over = { kind: 'mate', winner: -side };
    save();
    render(); renderPanels();
    requestAnalysis();
  }

  function onSquare(s) {
    if (S.over) return;
    const b = E.getBoard(), p = b[s], side = E.getSide();
    if (S.sel >= 0) {
      const mv = S.legal.find(m => (m & 127) === S.sel && (m >> 7) === s);
      if (mv !== undefined) { play(mv); return; }
    }
    S.sel = (p * side > 0 && s !== S.sel) ? s : -1;
    render();
  }

  // ------------------------------------------------------------------ 분석 (Web Worker)
  function workerBody() {
    const Eng = createEngine();
    self.onmessage = ev => {
      const d = ev.data;
      Eng.setPosition(d.start, 1);
      for (const m of d.moves) Eng.make(m);
      const res = Eng.search({
        timeMs: d.timeMs, maxDepth: d.maxDepth, multiPV: d.multiPV,
        onProgress: p => self.postMessage({ type: 'progress', res: p }),
      });
      self.postMessage({ type: 'done', res });
    };
  }
  let workerUrl = null, worker = null, fallbackEngine = null, workerBroken = false;
  function makeWorker() {
    if (!workerUrl) {
      const src = 'const createEngine=' + createEngine.toString() + ';(' + workerBody.toString() + ')();';
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
    if (S.over || !(side === S.me || S.showOpp)) { renderPanels(); return; }
    if (!S.legal.length) { renderPanels(); return; }
    const id = S.job;
    S.thinking = true; S.analysisSide = side;
    const payload = {
      start: Array.from(S.startBoard), moves: S.moves.map(x => x.m),
      timeMs: S.timeMs, maxDepth: 30, multiPV: S.pv,
    };
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
      fallbackEngine = fallbackEngine || createEngine();
      fallbackEngine.setPosition(Int8Array.from(payload.start), 1);
      for (const m of payload.moves) fallbackEngine.make(m);
      onRes(fallbackEngine.search(payload), true);
    }, 40);
  }

  // ------------------------------------------------------------------ 그리기
  const toView = s => { const x = s % 9, y = (s / 9) | 0; return S.flipped ? [8 - x, 9 - y] : [x, y]; };
  const fromView = (vx, vy) => (S.flipped ? [8 - vx, 9 - vy] : [vx, vy]);
  const oct = (cx, cy, r) => {
    let pts = '';
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; pts += `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `; }
    return pts;
  };
  const center = s => { const [vx, vy] = toView(s); return [px(vx), py(vy)]; };

  function gridSvg() {
    let g = `<rect class="b-bg" x="0" y="0" width="520" height="576" rx="10"/>`;
    g += `<rect class="b-frame" x="${MX - 10}" y="${MY - 10}" width="${8 * CELL + 20}" height="${9 * CELL + 20}"/>`;
    for (let i = 0; i < 9; i++) g += `<line class="b-line" x1="${px(i)}" y1="${py(0)}" x2="${px(i)}" y2="${py(9)}"/>`;
    for (let j = 0; j < 10; j++) g += `<line class="b-line" x1="${px(0)}" y1="${py(j)}" x2="${px(8)}" y2="${py(j)}"/>`;
    for (const [y0, y1] of [[0, 2], [7, 9]]) {
      g += `<line class="b-line" x1="${px(3)}" y1="${py(y0)}" x2="${px(5)}" y2="${py(y1)}"/>`;
      g += `<line class="b-line" x1="${px(5)}" y1="${py(y0)}" x2="${px(3)}" y2="${py(y1)}"/>`;
    }
    for (let vx = 0; vx < 9; vx++) {              // 열 번호(1~9) — 뒤집혀도 칸 번호와 일치
      const n = (S.flipped ? 8 - vx : vx) + 1;
      g += `<text class="b-axis" x="${px(vx)}" y="${MY - 22}">${n}</text><text class="b-axis" x="${px(vx)}" y="${py(9) + 24}">${n}</text>`;
    }
    for (let vy = 0; vy < 10; vy++) {             // 행 번호(1~10)
      const n = (S.flipped ? 9 - vy : vy) + 1;
      g += `<text class="b-axis" x="${MX - 24}" y="${py(vy)}">${n}</text><text class="b-axis" x="${px(8) + 24}" y="${py(vy)}">${n}</text>`;
    }
    return g;
  }

  function arrowSvg(from, to, rank) {
    const [x1, y1] = center(from), [x2, y2] = center(to);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const w = rank === 1 ? 7 : 4, head = rank === 1 ? 20 : 14;
    const sx = x1 + ux * 16, sy = y1 + uy * 16, ex = x2 - ux * 8, ey = y2 - uy * 8;
    const bx = ex - ux * head, by = ey - uy * head, nx = -uy, ny = ux;
    const op = rank === 1 ? 0.92 : 0.6;
    return `<g class="arrow arrow-${rank}" opacity="${op}">` +
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke-width="${w}" stroke-linecap="round"/>` +
      `<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${(bx + nx * head * .55).toFixed(1)},${(by + ny * head * .55).toFixed(1)} ${(bx - nx * head * .55).toFixed(1)},${(by - ny * head * .55).toFixed(1)}" stroke="none"/></g>`;
  }

  function render() {
    const b = E.getBoard(), side = E.getSide();
    let h = gridSvg();
    const last = S.moves.length ? S.moves[S.moves.length - 1].m : null;
    if (last !== null && last !== PASS) {
      for (const s of [last & 127, last >> 7]) { const [cx, cy] = center(s); h += `<rect class="hl-last" x="${cx - 24}" y="${cy - 24}" width="48" height="48" rx="8"/>`; }
    }
    if (S.check && !S.over) { const k = b.findIndex(p => p === side); if (k >= 0) { const [cx, cy] = center(k); h += `<circle class="hl-check" cx="${cx}" cy="${cy}" r="31"/>`; } }
    if (S.sel >= 0) { const [cx, cy] = center(S.sel); h += `<circle class="hl-sel" cx="${cx}" cy="${cy}" r="29"/>`; }
    for (let s = 0; s < 90; s++) {
      const p = b[s]; if (!p) continue;
      const c = p > 0 ? 'cho' : 'han', t = Math.abs(p), [cx, cy] = center(s), r = RADIUS[t];
      h += `<g><polygon class="p-body ${c}" points="${oct(cx, cy, r)}"/><polygon class="p-ring ${c}" points="${oct(cx, cy, r - 4)}"/>` +
        `<text class="p-text ${c}" x="${cx}" y="${cy + 1}" font-size="${Math.round(r * 1.08)}">${GLYPH[p > 0 ? 1 : -1][t]}</text></g>`;
    }
    if (S.sel >= 0) {
      for (const m of S.legal) {
        if ((m & 127) !== S.sel) continue;
        const [cx, cy] = center(m >> 7);
        h += b[m >> 7] ? `<circle class="hl-cap" cx="${cx}" cy="${cy}" r="29"/>` : `<circle class="hl-dot" cx="${cx}" cy="${cy}" r="7"/>`;
      }
    }
    const an = S.analysis;
    if (an && an.lines.length && S.analysisSide === side && !S.over) {
      for (let i = an.lines.length - 1; i >= 0; i--) {
        const m = an.lines[i].move;
        if (m === PASS) continue;
        h += arrowSvg(m & 127, m >> 7, i + 1);
        if (i > 0) { const [cx, cy] = center(m >> 7); h += `<g class="badge-n"><circle cx="${cx + 18}" cy="${cy - 18}" r="10" class="arrow-${i + 1}"/><text x="${cx + 18}" y="${cy - 17}">${i + 1}</text></g>`; }
      }
    }
    $('board').innerHTML = h;
  }

  function renderPanels() {
    const side = E.getSide(), mine = side === S.me;
    // 상단 바
    const tb = $('turnbar');
    tb.className = 'turnbar ' + (side === 1 ? 'cho' : 'han');
    const badge = $('turn-badge');
    badge.hidden = false; badge.className = 'badge';
    if (S.over) {
      $('turn-text').textContent = `${S.over.winner === 1 ? '초' : '한'} 승리`;
      badge.className = 'badge end'; badge.textContent = '장군 외통';
    } else {
      $('turn-text').textContent = `${side === 1 ? '초(楚)' : '한(漢)'} 차례 · ${mine ? '내 수' : '상대 수'}`;
      if (S.check) badge.textContent = '장군!';
      else if (E.facing()) { badge.className = 'badge info'; badge.textContent = '빅장'; }
      else if (!S.legal.length) { badge.className = 'badge info'; badge.textContent = '한수쉼만 가능'; }
      else badge.hidden = true;
    }
    $('btn-undo').disabled = !S.moves.length;
    $('btn-pass').disabled = !!S.over || S.check;

    // 기보
    $('hist-count').textContent = S.moves.length ? `(${S.moves.length}수)` : '';
    $('history').innerHTML = S.moves.map((x, i) => `<li class="${x.side === 1 ? 'cho' : 'han'}"><span class="n">${i + 1}</span><span class="t">${x.text}</span></li>`).join('');

    renderReco(side, mine);
  }

  function renderReco(side, mine) {
    const el = $('reco'), an = S.analysis;
    const meName = S.me === 1 ? '초' : '한';
    let h = '';
    if (S.over) {
      h = `<div class="title"><h2>대국 종료</h2></div><p class="msg">${S.over.winner === S.me ? '내가 이겼어요!' : '상대가 이겼어요.'} 잘못 입력했다면 <b>무르기</b>로 고칠 수 있어요.</p>`;
    } else if (!mine && !S.showOpp) {
      h = `<div class="title"><h2>상대(${side === 1 ? '초' : '한'}) 차례</h2></div><p class="msg">실제 대국에서 상대가 둔 수를 그대로 입력하세요. <b>상대 말을 누르고 → 도착 칸</b>을 누르면 됩니다. 입력이 끝나면 내 추천 수를 바로 계산해요.</p>`;
    } else if (!S.legal.length) {
      h = `<div class="title"><h2>둘 수 없음</h2></div><p class="msg">움직일 수 있는 말이 없어요. <b>한수쉼</b>을 누르세요.</p>`;
    } else {
      const label = mine ? '내 추천 수' : '상대 예상 수';
      h += `<div class="title"><h2>${label}</h2><span class="meta">${S.thinking ? '<span class="spinner"></span>생각 중' : '완료'}${an && an.depth ? ` · ${an.depth}수 앞 · ${(an.nodes / 1000 | 0).toLocaleString()}k노드` : ''}</span></div>`;
      if (!an || !an.lines.length) {
        h += `<p class="msg">${S.thinking ? '국면을 분석하고 있어요…' : '추천할 수가 없어요.'}</p>`;
      } else {
        const top = an.lines[0].score, pct = winPct(top);
        h += `<div class="evalbar ${side === -1 ? 'han-me' : ''}" title="현재 국면 평가 (두는 쪽 기준 ${pct}%)"><i style="width:${pct}%"></i></div>`;
        an.lines.forEach((ln, i) => {
          const d = describe(ln.move), sc = fmtScore(ln.score);
          const rest = pvText(ln.pv).slice(1, 6);
          h += `<div class="cand ${i === 0 ? 'best' : ''}"><span class="rank">${i + 1}</span><span class="mv">${d.text}${d.cap ? `<span class="cap">${d.cap}</span>` : ''}</span><span class="score ${sc.cls}">${sc.label}</span>` +
            (rest.length ? `<span class="pv">이후: ${rest.join(' · ')}</span>` : '<span class="pv"></span>') +
            `<span class="play"><button type="button" data-play="${ln.move}">${i === 0 ? '추천대로 두기' : '이 수 두기'}</button></span></div>`;
        });
      }
    }
    el.innerHTML = h;
  }

  // ------------------------------------------------------------------ 저장/복원
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ me: S.me, choForm: S.choForm, hanForm: S.hanForm, timeMs: S.timeMs, pv: S.pv, showOpp: S.showOpp, moves: S.moves.map(x => x.m) }));
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
  function fillForms(id, cur) {
    const root = $(id);
    root.innerHTML = E.FORMS.map(f => `<button type="button" role="radio" data-v="${f.id}" class="${f.id === cur ? 'on' : ''}" aria-checked="${f.id === cur}"><b>${f.seq}</b><span>${f.name}</span></button>`).join('');
  }
  function markSeg(id, v) { $(id).querySelectorAll('button').forEach(b => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); }

  function showScreen(name) { $('setup').hidden = name !== 'setup'; $('game').hidden = name !== 'game'; window.scrollTo(0, 0); }

  function init() {
    fillForms('seg-cho', 0); fillForms('seg-han', 0);
    segBind('seg-me', v => { S.me = +v; });
    segBind('seg-cho', v => { S.choForm = +v; });
    segBind('seg-han', v => { S.hanForm = +v; });
    segBind('seg-time', v => { S.timeMs = +v; });
    $('btn-start').addEventListener('click', () => { showScreen('game'); newGame(); });
    const saved = load();
    if (saved && saved.moves && saved.moves.length) {
      $('btn-resume').hidden = false;
      $('btn-resume').textContent = `이어서 두기 (${saved.moves.length}수 · 내 진영 ${saved.me === 1 ? '초' : '한'})`;
      $('btn-resume').addEventListener('click', () => {
        Object.assign(S, { me: saved.me, choForm: saved.choForm, hanForm: saved.hanForm, timeMs: saved.timeMs || 3000, pv: saved.pv || 3, showOpp: !!saved.showOpp });
        syncSettingsUI(); showScreen('game'); replay(saved.moves);
      });
    }

    $('board').addEventListener('click', ev => {
      const r = $('board').getBoundingClientRect();
      const x = (ev.clientX - r.left) * 520 / r.width, y = (ev.clientY - r.top) * 576 / r.height;
      const vx = Math.round((x - MX) / CELL), vy = Math.round((y - MY) / CELL);
      if (vx < 0 || vx > 8 || vy < 0 || vy > 9) return;
      const [bx, by] = fromView(vx, vy);
      onSquare(by * 9 + bx);
    });
    $('reco').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-play]'); if (!b || S.over) return;
      const m = +b.dataset.play; if (S.legal.includes(m)) play(m);
    });
    $('btn-undo').addEventListener('click', undoMove);
    $('btn-pass').addEventListener('click', () => { if (!S.over && !S.check) play(PASS); });
    $('btn-flip').addEventListener('click', () => { S.flipped = !S.flipped; render(); });
    $('btn-menu').addEventListener('click', () => $('dlg-menu').showModal());
    $('dlg-menu').addEventListener('click', ev => {   // close 이벤트는 화면이 그려질 때까지 늦어질 수 있어 클릭에서 바로 처리
      const btn = ev.target.closest('button[value]'); if (!btn) return;
      ev.preventDefault(); $('dlg-menu').close();
      const v = btn.value;
      if (v === 'new') { stopAnalysis(); showScreen('setup'); }
      else if (v === 'restart') { showScreen('game'); newGame(); }
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
    markSeg('seg-me', S.me); markSeg('seg-cho', S.choForm); markSeg('seg-han', S.hanForm); markSeg('seg-time', S.timeMs);
  }

  init();
  window.__janggi = { S, E, stop: stopAnalysis };   // 디버깅용 + 한 파일 버전에서 화면을 떠날 때 계산 중지
})();
