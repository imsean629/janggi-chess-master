/*
 * 장기 엔진: 규칙(수 생성/장군 판정) + 알파-베타 탐색.
 * createEngine()은 독립된 인스턴스를 돌려준다. 함수 소스를 그대로 Web Worker에 넣을 수 있도록
 * 바깥 변수에 의존하지 않는다.
 *
 * 좌표: x 0..8(왼→오), y 0..9(위→아래). 한(漢)은 위(y 0~2 궁성), 초(楚)는 아래(y 7~9 궁성).
 * 기물: 초 = 양수, 한 = 음수. 1 궁, 2 사, 3 상, 4 마, 5 차, 6 포, 7 졸/병.
 * 수(move): from | (to << 7),  한수쉼 = PASS.
 */
function createEngine() {
  'use strict';

  const KING = 1, ADV = 2, ELE = 3, HOR = 4, CHA = 5, CAN = 6, SOL = 7;
  const N = 90, PASS = 16383, INF = 1000000, MATE = 100000, MAXPLY = 96, STRIDE = 192;

  // ---------------------------------------------------------------- 정적 테이블
  const OX = [0, 0, -1, 1], OY = [-1, 1, 0, 0];      // 상 하 좌 우
  const DX = [-1, 1, -1, 1], DY = [-1, -1, 1, 1];    // 좌상 우상 좌하 우하
  const X = new Int8Array(N), Y = new Int8Array(N);
  for (let s = 0; s < N; s++) { X[s] = s % 9; Y[s] = (s / 9) | 0; }
  const sqOf = (x, y) => (x < 0 || x > 8 || y < 0 || y > 9) ? -1 : y * 9 + x;
  const dirIndex = (dx, dy) => { for (let d = 0; d < 4; d++) if (DX[d] === dx && DY[d] === dy) return d; return -1; };

  const orthTo = new Int16Array(N * 4);
  const diagTo = new Int16Array(N * 4).fill(-1);     // 궁성 대각선 연결만
  const palaceOf = new Int8Array(N);                 // 1 = 위(한) 궁성, 2 = 아래(초) 궁성
  for (let s = 0; s < N; s++) {
    for (let d = 0; d < 4; d++) orthTo[s * 4 + d] = sqOf(X[s] + OX[d], Y[s] + OY[d]);
    if (X[s] >= 3 && X[s] <= 5) { if (Y[s] <= 2) palaceOf[s] = 1; else if (Y[s] >= 7) palaceOf[s] = 2; }
  }
  for (const cy of [1, 8]) {
    const c = cy * 9 + 4;
    for (const kx of [3, 5]) for (const ky of [cy - 1, cy + 1]) {
      const k = ky * 9 + kx;
      diagTo[k * 4 + dirIndex(4 - kx, cy - ky)] = c;   // 모서리 → 중앙
      diagTo[c * 4 + dirIndex(kx - 4, ky - cy)] = k;   // 중앙 → 모서리
    }
  }
  // 궁·사의 이동 후보 (궁성 안 직선 + 대각선)
  const palNbr = [];
  for (let s = 0; s < N; s++) {
    const list = [];
    if (palaceOf[s]) {
      for (let d = 0; d < 4; d++) { const t = orthTo[s * 4 + d]; if (t >= 0 && palaceOf[t] === palaceOf[s]) list.push(t); }
      for (let d = 0; d < 4; d++) { const t = diagTo[s * 4 + d]; if (t >= 0) list.push(t); }
    }
    palNbr.push(list);
  }
  // 마: [다리, 도착], 상: [다리1, 다리2, 도착]
  const horseMoves = [], eleMoves = [];
  const revHorse = Array.from({ length: N }, () => []);
  const revEle = Array.from({ length: N }, () => []);
  for (let s = 0; s < N; s++) {
    const hm = [], em = [];
    for (let d = 0; d < 4; d++) {
      const lx = OX[d], ly = OY[d];
      for (const sg of [-1, 1]) {
        const px = ly !== 0 ? sg : 0, py = lx !== 0 ? sg : 0;   // 직교 방향 단위벡터
        const leg1 = sqOf(X[s] + lx, Y[s] + ly);
        const ht = sqOf(X[s] + 2 * lx + px, Y[s] + 2 * ly + py);
        if (leg1 >= 0 && ht >= 0) { hm.push([leg1, ht]); revHorse[ht].push([s, leg1]); }
        const leg2 = sqOf(X[s] + 2 * lx + px, Y[s] + 2 * ly + py);
        const et = sqOf(X[s] + 3 * lx + 2 * px, Y[s] + 3 * ly + 2 * py);
        if (leg1 >= 0 && leg2 >= 0 && et >= 0) { em.push([leg1, leg2, et]); revEle[et].push([s, leg1, leg2]); }
      }
    }
    horseMoves.push(hm); eleMoves.push(em);
  }
  // 졸/병: 인덱스 0 = 한(아래로 전진), 2 = 초(위로 전진)
  const solMoves = [[], [], []];
  const revSol = [Array.from({ length: N }, () => []), null, Array.from({ length: N }, () => [])];
  for (const c of [-1, 1]) {
    const fwd = c === 1 ? -1 : 1;
    for (let s = 0; s < N; s++) {
      const list = [];
      const f = sqOf(X[s], Y[s] + fwd); if (f >= 0) list.push(f);
      const l = sqOf(X[s] - 1, Y[s]); if (l >= 0) list.push(l);
      const r = sqOf(X[s] + 1, Y[s]); if (r >= 0) list.push(r);
      for (let d = 0; d < 4; d++) if (DY[d] === fwd) { const t = diagTo[s * 4 + d]; if (t >= 0) list.push(t); }
      solMoves[c + 1].push(list);
      for (const t of list) revSol[c + 1][t].push(s);
    }
  }

  // ---------------------------------------------------------------- 평가 테이블
  const BASE = [0, 0, 300, 300, 500, 1300, 700, 200];
  const ORD = [0, 100, 3, 3, 5, 13, 7, 2];   // 수 정렬용 기물 순위
  function choValue(type, x, y) {             // 초 관점(자기 진영이 아래)
    let v = BASE[type];
    const cx = 4 - Math.abs(x - 4);
    switch (type) {
      case SOL: v += Math.max(0, 6 - y) * 7; if (y <= 2 && x >= 3 && x <= 5) v += 15; if (x === 0 || x === 8) v -= 5; break;
      case HOR: v += cx * 6 + (y <= 6 ? 6 : 0); break;
      case CHA: v += cx * 2 + (y <= 6 ? 8 : 0); break;
      case CAN: v += cx * 2; break;
      case ELE: v += cx * 2; break;
      case ADV: if (x === 4) v += 6; break;
    }
    return v;
  }
  const PVAL = new Int32Array(15 * N);        // [(p + 7) * N + sq], 초 관점 점수
  for (let type = 1; type <= 7; type++) for (let s = 0; s < N; s++) {
    PVAL[(type + 7) * N + s] = choValue(type, X[s], Y[s]);
    PVAL[(-type + 7) * N + s] = -choValue(type, 8 - X[s], 9 - Y[s]);
  }

  // ---------------------------------------------------------------- Zobrist
  let seed = 0x9E3779B9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const zHi = new Int32Array(14 * N), zLo = new Int32Array(14 * N);
  for (let i = 0; i < zHi.length; i++) { zHi[i] = rnd(); zLo[i] = rnd(); }
  const sideHi = rnd(), sideLo = rnd();
  const zi = p => (p > 0 ? p - 1 : 6 - p);   // p<0: 7 + (-p) - 1

  // ---------------------------------------------------------------- 상태
  const board = new Int8Array(N);
  let side = 1;                               // 1 = 초, -1 = 한
  const kingPos = [-1, -1, -1];               // [c + 1]
  let hHi = 0, hLo = 0, ev = 0;
  const STK = 4096;
  const stM = new Int32Array(STK), stCap = new Int8Array(STK), stHi = new Int32Array(STK), stLo = new Int32Array(STK), stEv = new Int32Array(STK);
  let sp = 0;

  function setPosition(arr, s) {
    board.set(arr); side = s; sp = 0; hHi = 0; hLo = 0; ev = 0;
    kingPos[0] = kingPos[2] = -1;
    for (let q = 0; q < N; q++) {
      const p = board[q];
      if (!p) continue;
      hHi ^= zHi[zi(p) * N + q]; hLo ^= zLo[zi(p) * N + q];
      ev += PVAL[(p + 7) * N + q];
      if (p === KING) kingPos[2] = q; else if (p === -KING) kingPos[0] = q;
    }
    if (side === -1) { hHi ^= sideHi; hLo ^= sideLo; }
  }

  function make(m) {
    stM[sp] = m; stHi[sp] = hHi; stLo[sp] = hLo; stEv[sp] = ev;
    if (m !== PASS) {
      const f = m & 127, t = m >> 7, p = board[f], cap = board[t];
      stCap[sp] = cap;
      hHi ^= zHi[zi(p) * N + f] ^ zHi[zi(p) * N + t]; hLo ^= zLo[zi(p) * N + f] ^ zLo[zi(p) * N + t];
      ev += PVAL[(p + 7) * N + t] - PVAL[(p + 7) * N + f];
      if (cap) { hHi ^= zHi[zi(cap) * N + t]; hLo ^= zLo[zi(cap) * N + t]; ev -= PVAL[(cap + 7) * N + t]; }
      board[t] = p; board[f] = 0;
      if (p === KING) kingPos[2] = t; else if (p === -KING) kingPos[0] = t;
    }
    hHi ^= sideHi; hLo ^= sideLo; side = -side; sp++;
  }

  function undo() {
    sp--; const m = stM[sp];
    side = -side; hHi = stHi[sp]; hLo = stLo[sp]; ev = stEv[sp];
    if (m !== PASS) {
      const f = m & 127, t = m >> 7, p = board[t];
      board[f] = p; board[t] = stCap[sp];
      if (p === KING) kingPos[2] = f; else if (p === -KING) kingPos[0] = f;
    }
  }

  // ---------------------------------------------------------------- 수 생성 (의사합법)
  function gen(c, caps, out, base) {
    let n = base;
    for (let s = 0; s < N; s++) {
      const p = board[s] * c;
      if (p <= 0) continue;
      switch (p) {
        case KING: case ADV: {
          const nb = palNbr[s];
          for (let i = 0; i < nb.length; i++) {
            const t = nb[i], q = board[t] * c;
            if (q <= 0 && (!caps || q !== 0)) out[n++] = s | (t << 7);
          }
          break;
        }
        case HOR: {
          const hm = horseMoves[s];
          for (let i = 0; i < hm.length; i++) {
            const h = hm[i];
            if (board[h[0]] !== 0) continue;
            const q = board[h[1]] * c;
            if (q <= 0 && (!caps || q !== 0)) out[n++] = s | (h[1] << 7);
          }
          break;
        }
        case ELE: {
          const em = eleMoves[s];
          for (let i = 0; i < em.length; i++) {
            const e = em[i];
            if (board[e[0]] !== 0 || board[e[1]] !== 0) continue;
            const q = board[e[2]] * c;
            if (q <= 0 && (!caps || q !== 0)) out[n++] = s | (e[2] << 7);
          }
          break;
        }
        case SOL: {
          const sm = solMoves[c + 1][s];
          for (let i = 0; i < sm.length; i++) {
            const t = sm[i], q = board[t] * c;
            if (q <= 0 && (!caps || q !== 0)) out[n++] = s | (t << 7);
          }
          break;
        }
        case CHA: {
          for (let pass = 0; pass < 2; pass++) {
            const tab = pass ? diagTo : orthTo;
            for (let d = 0; d < 4; d++) {
              let t = tab[s * 4 + d];
              while (t >= 0) {
                const q = board[t] * c;
                if (q === 0) { if (!caps) out[n++] = s | (t << 7); }
                else { if (q < 0) out[n++] = s | (t << 7); break; }
                t = tab[t * 4 + d];
              }
            }
          }
          break;
        }
        case CAN: {
          for (let pass = 0; pass < 2; pass++) {
            const tab = pass ? diagTo : orthTo;
            for (let d = 0; d < 4; d++) {
              let t = tab[s * 4 + d];
              if (pass) {                      // 대각선: 바로 옆(중앙)이 받침, 그 너머 한 칸만
                if (t < 0 || board[t] === 0 || Math.abs(board[t]) === CAN) continue;
                const u = tab[t * 4 + d];
                if (u < 0) continue;
                const q = board[u] * c;
                if (q === 0) { if (!caps) out[n++] = s | (u << 7); }
                else if (q < 0 && Math.abs(board[u]) !== CAN) out[n++] = s | (u << 7);
                continue;
              }
              while (t >= 0 && board[t] === 0) t = tab[t * 4 + d];
              if (t < 0 || Math.abs(board[t]) === CAN) continue;   // 받침 없음 / 포는 못 넘음
              let u = tab[t * 4 + d];
              while (u >= 0) {
                const q = board[u] * c;
                if (q === 0) { if (!caps) out[n++] = s | (u << 7); }
                else { if (q < 0 && Math.abs(board[u]) !== CAN) out[n++] = s | (u << 7); break; }
                u = tab[u * 4 + d];
              }
            }
          }
          break;
        }
      }
    }
    return n - base;
  }

  // ---------------------------------------------------------------- 장군 / 빅장
  function inCheck(c) {
    const k = kingPos[c + 1];
    if (k < 0) return true;
    const eChariot = -c * CHA, eCannon = -c * CAN;
    for (let d = 0; d < 4; d++) {                       // 직선: 차, 포
      let t = orthTo[k * 4 + d];
      while (t >= 0 && board[t] === 0) t = orthTo[t * 4 + d];
      if (t < 0) continue;
      if (board[t] === eChariot) return true;
      if (Math.abs(board[t]) === CAN) continue;         // 포는 포를 받침으로 못 씀
      let u = orthTo[t * 4 + d];
      while (u >= 0 && board[u] === 0) u = orthTo[u * 4 + d];
      if (u >= 0 && board[u] === eCannon) return true;
    }
    for (let d = 0; d < 4; d++) {                       // 궁성 대각선: 차, 포
      const t = diagTo[k * 4 + d];
      if (t < 0) continue;
      const q = board[t], u = diagTo[t * 4 + d];
      if (q === eChariot) return true;
      if (q === 0) { if (u >= 0 && board[u] === eChariot) return true; }
      else if (Math.abs(q) !== CAN && u >= 0 && board[u] === eCannon) return true;
    }
    const eHorse = -c * HOR, rh = revHorse[k];
    for (let i = 0; i < rh.length; i++) if (board[rh[i][0]] === eHorse && board[rh[i][1]] === 0) return true;
    const eEle = -c * ELE, re = revEle[k];
    for (let i = 0; i < re.length; i++) if (board[re[i][0]] === eEle && board[re[i][1]] === 0 && board[re[i][2]] === 0) return true;
    const eSol = -c * SOL, rs = revSol[-c + 1][k];
    for (let i = 0; i < rs.length; i++) if (board[rs[i]] === eSol) return true;
    return false;
  }

  function facing() {                          // 빅장 여부(정보용): 두 궁이 같은 줄에서 마주봄. 탐색은 일반 국면처럼 계속 진행한다
    const a = kingPos[0], b = kingPos[2];
    if (a < 0 || b < 0 || X[a] !== X[b]) return false;
    for (let s = a + 9; s < b; s += 9) if (board[s]) return false;
    return true;
  }

  // ---------------------------------------------------------------- 합법 수
  const tmp = new Int32Array(STRIDE);
  function legalMoves(c) {
    c = c || side;
    const n = gen(c, false, tmp, 0), res = [];
    const saved = tmp.slice(0, n);
    const wasSide = side;
    if (c !== side) { hHi ^= sideHi; hLo ^= sideLo; side = c; }
    for (let i = 0; i < n; i++) {
      make(saved[i]);
      if (!inCheck(c)) res.push(saved[i]);
      undo();
    }
    if (side !== wasSide) { hHi ^= sideHi; hLo ^= sideLo; side = wasSide; }
    return res;
  }

  // ---------------------------------------------------------------- 탐색
  const TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const ttLock = new Int32Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);
  const ttScore = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE);
  ttFlag.fill(-1);
  const EXACT = 0, LOWER = 1, UPPER = 2;
  const moveBuf = new Int32Array(MAXPLY * STRIDE), scoreBuf = new Int32Array(MAXPLY * STRIDE);
  const killers = new Int32Array(MAXPLY * 2), history = new Int32Array(N * N);
  let nodes = 0, stopped = false, deadline = 0, iterDepth = 1;

  const evalSide = () => (side === 1 ? ev : -ev);
  const toTT = (s, ply) => (s > MATE - MAXPLY ? s + ply : s < -MATE + MAXPLY ? s - ply : s);
  const fromTT = (s, ply) => (s > MATE - MAXPLY ? s - ply : s < -MATE + MAXPLY ? s + ply : s);
  function checkTime() { if ((nodes & 2047) === 0 && iterDepth > 1 && Date.now() > deadline) stopped = true; }

  function orderMoves(n, base, ply, ttMv) {
    for (let i = 0; i < n; i++) {
      const m = moveBuf[base + i], f = m & 127, t = m >> 7, cap = board[t];
      let sc;
      if (m === ttMv) sc = 10000000;
      else if (cap !== 0) sc = 1000000 + ORD[Math.abs(cap)] * 16 - ORD[Math.abs(board[f])];
      else if (m === killers[ply * 2]) sc = 900000;
      else if (m === killers[ply * 2 + 1]) sc = 800000;
      else sc = history[f * N + t];
      scoreBuf[base + i] = sc;
    }
  }
  function pick(i, n, base) {
    let bi = i, bs = scoreBuf[base + i];
    for (let j = i + 1; j < n; j++) if (scoreBuf[base + j] > bs) { bs = scoreBuf[base + j]; bi = j; }
    if (bi !== i) {
      const m = moveBuf[base + i]; moveBuf[base + i] = moveBuf[base + bi]; moveBuf[base + bi] = m;
      scoreBuf[base + bi] = scoreBuf[base + i]; scoreBuf[base + i] = bs;
    }
    return moveBuf[base + i];
  }

  function quiesce(alpha, beta, ply, qd) {
    nodes++; checkTime();
    if (stopped) return 0;
    const stand = evalSide();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd >= 6 || ply >= MAXPLY - 2) return stand;
    const c = side, base = ply * STRIDE;
    const n = gen(c, true, moveBuf, base);
    orderMoves(n, base, ply, 0);
    for (let i = 0; i < n; i++) {
      const m = pick(i, n, base);
      make(m);
      if (inCheck(c)) { undo(); continue; }
      const score = -quiesce(-beta, -alpha, ply + 1, qd + 1);
      undo();
      if (stopped) return 0;
      if (score > alpha) { alpha = score; if (alpha >= beta) return alpha; }
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply) {
    nodes++; checkTime();
    if (stopped) return 0;
    if (ply >= MAXPLY - 8) return evalSide();
    for (let i = sp - 2, lim = Math.max(0, sp - 24); i >= lim; i -= 2) if (stHi[i] === hHi && stLo[i] === hLo) return 0;   // 반복 = 무승부
    const c = side, inChk = inCheck(c);
    if (inChk) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply, 0);

    let ttMv = 0;
    const idx = hLo & TT_MASK;
    if (ttLock[idx] === hHi && ttFlag[idx] !== -1) {
      ttMv = ttMove[idx];
      if (ttDepth[idx] >= depth) {
        const s = fromTT(ttScore[idx], ply), fl = ttFlag[idx];
        if (fl === EXACT) return s;
        if (fl === LOWER) { if (s > alpha) alpha = s; } else if (s < beta) beta = s;
        if (alpha >= beta) return s;
      }
    }

    const base = ply * STRIDE, origAlpha = alpha;
    const n = gen(c, false, moveBuf, base);
    orderMoves(n, base, ply, ttMv);
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < n; i++) {
      const m = pick(i, n, base), quiet = board[m >> 7] === 0;
      make(m);
      if (inCheck(c)) { undo(); continue; }
      legal++;
      let score;
      if (legal === 1) score = -negamax(depth - 1, -beta, -alpha, ply + 1);
      else {
        const r = (depth >= 3 && legal > 4 && quiet && !inChk) ? 1 : 0;
        score = -negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && (r > 0 || score < beta)) score = -negamax(depth - 1, -beta, -alpha, ply + 1);
      }
      undo();
      if (stopped) return 0;
      if (score > best) {
        best = score; bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (quiet) {
              if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
              history[(m & 127) * N + (m >> 7)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inChk ? -MATE + ply : evalSide();
    ttLock[idx] = hHi; ttDepth[idx] = depth > 100 ? 100 : depth; ttMove[idx] = bestMove;
    ttFlag[idx] = best <= origAlpha ? UPPER : best >= beta ? LOWER : EXACT;
    ttScore[idx] = toTT(best, ply);
    return best;
  }

  function extractPV(first) {
    const pv = [first]; let made = 1;
    make(first);
    while (pv.length < 12) {
      const idx = hLo & TT_MASK;
      if (ttLock[idx] !== hHi || ttFlag[idx] === -1 || !ttMove[idx]) break;
      const mv = ttMove[idx];
      if (!legalMoves().includes(mv)) break;
      pv.push(mv); make(mv); made++;
    }
    while (made--) undo();
    return pv;
  }

  const capValue = m => { const cap = board[m >> 7]; return cap ? ORD[Math.abs(cap)] : 0; };

  /** 현재 국면에서 (초/한 중 두는 쪽) 최선의 수 탐색. multiPV개의 후보를 정확한 점수로 돌려준다. */
  function search(opts) {
    const timeMs = opts.timeMs || 2000, maxDepth = opts.maxDepth || 24, K = opts.multiPV || 1;
    const onProgress = opts.onProgress || null;
    const t0 = Date.now();
    deadline = t0 + timeMs; stopped = false; nodes = 0; iterDepth = 1;
    killers.fill(0); history.fill(0);
    const rootSp = sp;
    let order = legalMoves();
    if (!order.length) return { lines: [], depth: 0, nodes: 0, elapsed: 0 };
    order.sort((a, b) => capValue(b) - capValue(a));
    let result = { lines: [], depth: 0, nodes: 0, elapsed: 0 };

    for (let depth = 1; depth <= maxDepth; depth++) {
      iterDepth = depth;
      const top = [];
      let aborted = false;
      for (const m of order) {
        const bound = top.length >= K ? top[K - 1].score : -INF;
        make(m);
        const score = -negamax(depth - 1, -INF, -bound, 1);
        undo();
        if (stopped) { aborted = true; break; }
        if (top.length < K || score > bound) {
          let i = top.length;
          while (i > 0 && top[i - 1].score < score) i--;
          top.splice(i, 0, { move: m, score });
          if (top.length > K) top.pop();
        }
      }
      if (aborted) break;
      const elapsed = Date.now() - t0;
      result = { lines: top.map(l => ({ move: l.move, score: l.score, pv: extractPV(l.move) })), depth, nodes, elapsed };
      if (onProgress) onProgress(result);
      const topSet = new Set(top.map(l => l.move));
      order = top.map(l => l.move).concat(order.filter(m => !topSet.has(m)));
      const bestScore = top[0].score;
      if (Math.abs(bestScore) > MATE - MAXPLY) break;      // 외통 확인됨
      if (order.length === 1 && depth >= 2) break;         // 둘 수가 하나뿐
      if (elapsed > timeMs * 0.4) break;                   // 다음 깊이는 시간 내 못 끝냄
    }
    while (sp > rootSp) undo();
    return result;
  }

  // ---------------------------------------------------------------- 초기 배치
  // 차림: 자기 진영에서 왼쪽→오른쪽으로 본 마/상 순서
  const FORMS = [
    { id: 0, name: '안상차림', seq: '마상상마', types: [HOR, ELE, ELE, HOR] },
    { id: 1, name: '바깥상차림', seq: '상마마상', types: [ELE, HOR, HOR, ELE] },
    { id: 2, name: '마상마상', seq: '마상마상', types: [HOR, ELE, HOR, ELE] },
    { id: 3, name: '상마상마', seq: '상마상마', types: [ELE, HOR, ELE, HOR] },
  ];
  function makeStart(choForm, hanForm) {
    const b = new Int8Array(N);
    const put = (x, y, p) => { b[y * 9 + x] = p; };
    for (const c of [1, -1]) {
      const back = c === 1 ? 9 : 0, gen1 = c === 1 ? 8 : 1, can = c === 1 ? 7 : 2, sol = c === 1 ? 6 : 3;
      put(0, back, c * CHA); put(8, back, c * CHA);
      put(3, back, c * ADV); put(5, back, c * ADV);
      put(4, gen1, c * KING);
      put(1, can, c * CAN); put(7, can, c * CAN);
      for (const x of [0, 2, 4, 6, 8]) put(x, sol, c * SOL);
      const form = FORMS[c === 1 ? choForm : hanForm], xs = c === 1 ? [1, 2, 6, 7] : [7, 6, 2, 1];
      for (let i = 0; i < 4; i++) put(xs[i], back, c * form.types[i]);
    }
    return b;
  }

  return {
    KING, ADV, ELE, HOR, CHA, CAN, SOL, PASS, MATE, MAXPLY, FORMS,
    setPosition, makeStart, make, undo, legalMoves, inCheck, facing, search,
    getBoard: () => Int8Array.from(board),
    getSide: () => side,
    getHash: () => hHi + ':' + hLo,
    getPly: () => sp,
    evaluate: () => ev,
    pseudoMoves: c => { const out = new Int32Array(STRIDE), n = gen(c, false, out, 0); return Array.from(out.slice(0, n)); },
    clearTT: () => { ttFlag.fill(-1); ttLock.fill(0); },
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createEngine };
