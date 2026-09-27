/*
 * 체스 엔진: 규칙(수 생성/체크/무승부 판정) + 알파-베타 탐색.
 * createChessEngine()은 독립된 인스턴스를 돌려준다. 함수 소스를 그대로 Web Worker에 넣을 수 있도록
 * 바깥 변수에 의존하지 않는다.
 *
 * 보드: 0x88 (sq = rank * 16 + file, rank 0 = 1랭크, file 0 = a파일).
 * 기물: 백 = 양수, 흑 = 음수. 1 폰, 2 나이트, 3 비숍, 4 룩, 5 퀸, 6 킹.
 * 수(move): from | to << 7 | promo << 14 | flag << 17  (flag: 1 앙파상, 2 캐슬링, 4 폰 두 칸)
 */
function createChessEngine() {
  'use strict';

  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4;
  const INF = 1000000, MATE = 100000, MAXPLY = 100, STRIDE = 256, NULLMOVE = 0;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
  const K_OFF = [1, -1, 16, -16, 15, 17, -15, -17];
  const B_DIR = [15, 17, -15, -17], R_DIR = [1, -1, 16, -16];
  const enc = (f, t, promo, flag) => f | (t << 7) | (promo << 14) | (flag << 17);

  // ---------------------------------------------------------------- 평가 테이블
  // 백 기준, 8랭크가 첫 줄인 표기 (Simplified Evaluation Function 계열 값)
  const PST_MG = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  ];
  const PAWN_EG_ROW = [0, 90, 60, 35, 20, 10, 5, 0];
  const KING_EG = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const VAL_MG = [0, 100, 320, 330, 500, 900, 0], VAL_EG = [0, 120, 300, 320, 520, 950, 0];
  const PH = [0, 0, 1, 1, 2, 4, 0];
  const ORD = [0, 1, 3, 3, 5, 9, 20];                 // 수 정렬용 기물 순위
  const PASS_MG = [0, 5, 10, 15, 25, 40, 60, 0], PASS_EG = [0, 10, 20, 35, 60, 100, 150, 0];

  const MG = new Int32Array(13 * 128), EG = new Int32Array(13 * 128);   // [(p + 6) * 128 + sq], 백 기준 점수
  for (let type = 1; type <= 6; type++) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = r * 16 + f, iw = (7 - r) * 8 + f, ib = r * 8 + f;
    const eg = t => (type === PAWN ? PAWN_EG_ROW[t >> 3] : type === KING ? KING_EG[t] : PST_MG[type][t] >> 1);
    MG[(type + 6) * 128 + sq] = VAL_MG[type] + PST_MG[type][iw];
    EG[(type + 6) * 128 + sq] = VAL_EG[type] + eg(iw);
    MG[(-type + 6) * 128 + sq] = -(VAL_MG[type] + PST_MG[type][ib]);
    EG[(-type + 6) * 128 + sq] = -(VAL_EG[type] + eg(ib));
  }
  const CMASK = new Int8Array(128).fill(15);         // 캐슬링 권리: 1 백 킹사이드, 2 백 퀸사이드, 4 흑 킹사이드, 8 흑 퀸사이드
  CMASK[0] = 13; CMASK[7] = 14; CMASK[4] = 12; CMASK[112] = 7; CMASK[119] = 11; CMASK[116] = 3;

  // ---------------------------------------------------------------- Zobrist
  let seed = 0x2545F491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const zHi = new Int32Array(13 * 128), zLo = new Int32Array(13 * 128);
  for (let i = 0; i < zHi.length; i++) { zHi[i] = rnd(); zLo[i] = rnd(); }
  const zcHi = new Int32Array(16), zcLo = new Int32Array(16), zeHi = new Int32Array(8), zeLo = new Int32Array(8);
  for (let i = 0; i < 16; i++) { zcHi[i] = rnd(); zcLo[i] = rnd(); }
  for (let i = 0; i < 8; i++) { zeHi[i] = rnd(); zeLo[i] = rnd(); }
  const sideHi = rnd(), sideLo = rnd();

  // ---------------------------------------------------------------- 상태
  const board = new Int8Array(128);
  let side = 1, castle = 0, ep = -1, half = 0, fullStart = 1, startBlack = false;
  const kingSq = [-1, -1, -1];                        // [c + 1]
  let hHi = 0, hLo = 0, mg = 0, eg = 0, phase = 0;
  const STK = 2048;
  const stM = new Int32Array(STK), stCap = new Int8Array(STK), stCastle = new Int8Array(STK), stEp = new Int16Array(STK), stHalf = new Int16Array(STK);
  const stHi = new Int32Array(STK), stLo = new Int32Array(STK), stMg = new Int32Array(STK), stEg = new Int32Array(STK), stPh = new Int8Array(STK);
  let sp = 0;

  function addP(sq, p) {
    board[sq] = p;
    const k = (p + 6) * 128 + sq;
    hHi ^= zHi[k]; hLo ^= zLo[k]; mg += MG[k]; eg += EG[k]; phase += PH[p > 0 ? p : -p];
  }
  function remP(sq) {
    const p = board[sq], k = (p + 6) * 128 + sq;
    hHi ^= zHi[k]; hLo ^= zLo[k]; mg -= MG[k]; eg -= EG[k]; phase -= PH[p > 0 ? p : -p];
    board[sq] = 0;
  }

  const FILES = 'abcdefgh';
  const sqName = sq => FILES[sq & 7] + ((sq >> 4) + 1);
  const PIECE_CH = ' pnbrqk';

  function setFen(fen) {
    const parts = String(fen).trim().split(/\s+/);
    const rows = (parts[0] || '').split('/');
    if (rows.length !== 8) return false;
    const b = new Int8Array(128);
    for (let i = 0; i < 8; i++) {
      let f = 0;
      for (const ch of rows[i]) {
        if (/[1-8]/.test(ch)) { f += +ch; continue; }
        const t = PIECE_CH.indexOf(ch.toLowerCase());
        if (t <= 0 || f > 7) return false;
        b[(7 - i) * 16 + f] = ch === ch.toUpperCase() ? t : -t;
        f++;
      }
      if (f !== 8) return false;
    }
    let wk = 0, bk = 0;
    for (let s = 0; s < 128; s++) { if (b[s] === KING) wk++; else if (b[s] === -KING) bk++; if ((b[s] === PAWN || b[s] === -PAWN) && ((s >> 4) === 0 || (s >> 4) === 7)) return false; }
    if (wk !== 1 || bk !== 1) return false;

    board.fill(0); hHi = 0; hLo = 0; mg = 0; eg = 0; phase = 0; sp = 0;
    for (let s = 0; s < 128; s++) if (b[s]) { addP(s, b[s]); if (b[s] === KING) kingSq[2] = s; else if (b[s] === -KING) kingSq[0] = s; }
    side = parts[1] === 'b' ? -1 : 1;
    castle = 0;
    const cs = parts[2] || '-';
    if (cs.includes('K') && board[4] === KING && board[7] === ROOK) castle |= 1;
    if (cs.includes('Q') && board[4] === KING && board[0] === ROOK) castle |= 2;
    if (cs.includes('k') && board[116] === -KING && board[119] === -ROOK) castle |= 4;
    if (cs.includes('q') && board[116] === -KING && board[112] === -ROOK) castle |= 8;
    ep = -1;
    if (parts[3] && /^[a-h][36]$/.test(parts[3])) {
      const e = (parts[3].charCodeAt(1) - 49) * 16 + (parts[3].charCodeAt(0) - 97);
      if (epCapturable(e, side)) ep = e;
    }
    half = parseInt(parts[4], 10) || 0;
    fullStart = parseInt(parts[5], 10) || 1;
    startBlack = side === -1;
    hHi ^= zcHi[castle]; hLo ^= zcLo[castle];
    if (ep >= 0) { hHi ^= zeHi[ep & 7]; hLo ^= zeLo[ep & 7]; }
    if (side === -1) { hHi ^= sideHi; hLo ^= sideLo; }
    if (inCheck(-side)) return false;               // 둘 차례가 아닌 쪽이 체크 → 불가능한 국면
    return true;
  }

  function getFen() {
    let s = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = board[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        const ch = PIECE_CH[p > 0 ? p : -p];
        s += p > 0 ? ch.toUpperCase() : ch;
      }
      if (empty) s += empty;
      if (r) s += '/';
    }
    let cs = (castle & 1 ? 'K' : '') + (castle & 2 ? 'Q' : '') + (castle & 4 ? 'k' : '') + (castle & 8 ? 'q' : '');
    return `${s} ${side === 1 ? 'w' : 'b'} ${cs || '-'} ${ep >= 0 ? sqName(ep) : '-'} ${half} ${fullStart + ((sp + (startBlack ? 1 : 0)) >> 1)}`;
  }

  // 앙파상 칸 e를 지나간 폰을 (c 차례에) 실제로 잡을 수 있는 폰이 옆에 있는가
  function epCapturable(e, c) {
    const pawnSq = e - 16 * c;                        // 두 칸 전진한 상대 폰의 위치
    return board[pawnSq] === -c * PAWN && (board[pawnSq - 1] === c * PAWN || board[pawnSq + 1] === c * PAWN);
  }

  // ---------------------------------------------------------------- 수 두기 / 무르기
  function push(m) {
    stM[sp] = m; stCastle[sp] = castle; stEp[sp] = ep; stHalf[sp] = half;
    stHi[sp] = hHi; stLo[sp] = hLo; stMg[sp] = mg; stEg[sp] = eg; stPh[sp] = phase;
  }

  function make(m) {
    push(m);
    const f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7, fl = (m >> 17) & 7;
    const p = board[f], c = p > 0 ? 1 : -1, type = p * c;
    let capSq = t;
    if (fl & F_EP) capSq = t - 16 * c;
    const cap = board[capSq];
    stCap[sp] = cap;
    if (cap) remP(capSq);
    remP(f);
    addP(t, promo ? c * promo : p);
    if (fl & F_CASTLE) {
      if (t > f) { remP(f + 3); addP(f + 1, c * ROOK); } else { remP(f - 4); addP(f - 1, c * ROOK); }
    }
    if (type === KING) kingSq[c + 1] = t;
    hHi ^= zcHi[castle]; hLo ^= zcLo[castle];
    castle &= CMASK[f] & CMASK[t];
    hHi ^= zcHi[castle]; hLo ^= zcLo[castle];
    if (ep >= 0) { hHi ^= zeHi[ep & 7]; hLo ^= zeLo[ep & 7]; ep = -1; }
    if ((fl & F_DOUBLE) && (board[t - 1] === -c * PAWN || board[t + 1] === -c * PAWN)) {
      ep = f + 16 * c; hHi ^= zeHi[ep & 7]; hLo ^= zeLo[ep & 7];
    }
    half = (type === PAWN || cap) ? 0 : half + 1;
    side = -side; hHi ^= sideHi; hLo ^= sideLo;
    sp++;
  }

  function undo() {
    sp--;
    const m = stM[sp];
    side = -side; castle = stCastle[sp]; ep = stEp[sp]; half = stHalf[sp];
    hHi = stHi[sp]; hLo = stLo[sp]; mg = stMg[sp]; eg = stEg[sp]; phase = stPh[sp];
    if (m === NULLMOVE) return;
    const f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7, fl = (m >> 17) & 7, c = side;
    const p = promo ? c * PAWN : board[t];
    board[f] = p; board[t] = 0;
    if (fl & F_EP) board[t - 16 * c] = stCap[sp]; else board[t] = stCap[sp];
    if (fl & F_CASTLE) {
      if (t > f) { board[f + 3] = board[f + 1]; board[f + 1] = 0; } else { board[f - 4] = board[f - 1]; board[f - 1] = 0; }
    }
    if (p === c * KING) kingSq[c + 1] = f;
  }

  function makeNull() {
    push(NULLMOVE);
    if (ep >= 0) { hHi ^= zeHi[ep & 7]; hLo ^= zeLo[ep & 7]; ep = -1; }
    half = 0;                                         // 반복 검사가 널무브를 넘어가지 않게
    side = -side; hHi ^= sideHi; hLo ^= sideLo;
    sp++;
  }

  // ---------------------------------------------------------------- 공격 / 체크
  function attacked(sq, by) {
    const pawn = by * PAWN;
    if (by === 1) { if (board[sq - 15] === pawn || board[sq - 17] === pawn) return true; }
    else if (board[sq + 15] === pawn || board[sq + 17] === pawn) return true;
    const kn = by * KNIGHT, kg = by * KING;
    for (let i = 0; i < 8; i++) {
      let s = sq + N_OFF[i];
      if (!(s & 0x88) && board[s] === kn) return true;
      s = sq + K_OFF[i];
      if (!(s & 0x88) && board[s] === kg) return true;
    }
    const bq = by * QUEEN, bb = by * BISHOP, br = by * ROOK;
    for (let i = 0; i < 4; i++) {
      let d = B_DIR[i], s = sq + d;
      while (!(s & 0x88)) { const q = board[s]; if (q) { if (q === bb || q === bq) return true; break; } s += d; }
      d = R_DIR[i]; s = sq + d;
      while (!(s & 0x88)) { const q = board[s]; if (q) { if (q === br || q === bq) return true; break; } s += d; }
    }
    return false;
  }
  const inCheck = c => attacked(kingSq[c + 1], -c);

  // ---------------------------------------------------------------- 수 생성 (의사합법)
  function gen(c, caps, out, base) {
    let n = base;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq] * c;
      if (p <= 0) continue;
      if (p === PAWN) {
        const fwd = 16 * c, t = sq + fwd, promoRank = c === 1 ? 7 : 0, startRank = c === 1 ? 1 : 6;
        const promo = (t >> 4) === promoRank;
        if (!(t & 0x88) && board[t] === 0) {
          if (promo) { out[n++] = enc(sq, t, QUEEN, 0); if (!caps) { out[n++] = enc(sq, t, KNIGHT, 0); out[n++] = enc(sq, t, ROOK, 0); out[n++] = enc(sq, t, BISHOP, 0); } }
          else if (!caps) {
            out[n++] = enc(sq, t, 0, 0);
            if ((sq >> 4) === startRank && board[t + fwd] === 0) out[n++] = enc(sq, t + fwd, 0, F_DOUBLE);
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const s = sq + d;
          if (s & 0x88) continue;
          if (board[s] * c < 0) {
            if (promo) { out[n++] = enc(sq, s, QUEEN, 0); if (!caps) { out[n++] = enc(sq, s, KNIGHT, 0); out[n++] = enc(sq, s, ROOK, 0); out[n++] = enc(sq, s, BISHOP, 0); } }
            else out[n++] = enc(sq, s, 0, 0);
          } else if (s === ep) out[n++] = enc(sq, s, 0, F_EP);
        }
      } else if (p === KNIGHT || p === KING) {
        const offs = p === KNIGHT ? N_OFF : K_OFF;
        for (let i = 0; i < 8; i++) {
          const s = sq + offs[i];
          if (s & 0x88) continue;
          const q = board[s] * c;
          if (q < 0 || (q === 0 && !caps)) out[n++] = enc(sq, s, 0, 0);
        }
        if (p === KING && !caps) {
          if (c === 1 && sq === 4) {
            if ((castle & 1) && !board[5] && !board[6] && board[7] === ROOK && !attacked(4, -1) && !attacked(5, -1)) out[n++] = enc(4, 6, 0, F_CASTLE);
            if ((castle & 2) && !board[3] && !board[2] && !board[1] && board[0] === ROOK && !attacked(4, -1) && !attacked(3, -1)) out[n++] = enc(4, 2, 0, F_CASTLE);
          } else if (c === -1 && sq === 116) {
            if ((castle & 4) && !board[117] && !board[118] && board[119] === -ROOK && !attacked(116, 1) && !attacked(117, 1)) out[n++] = enc(116, 118, 0, F_CASTLE);
            if ((castle & 8) && !board[115] && !board[114] && !board[113] && board[112] === -ROOK && !attacked(116, 1) && !attacked(115, 1)) out[n++] = enc(116, 114, 0, F_CASTLE);
          }
        }
      } else {
        const dirs = p === BISHOP ? B_DIR : p === ROOK ? R_DIR : K_OFF;
        for (let i = 0; i < dirs.length; i++) {
          const d = dirs[i];
          let s = sq + d;
          while (!(s & 0x88)) {
            const q = board[s] * c;
            if (q === 0) { if (!caps) out[n++] = enc(sq, s, 0, 0); }
            else { if (q < 0) out[n++] = enc(sq, s, 0, 0); break; }
            s += d;
          }
        }
      }
    }
    return n - base;
  }

  const tmp = new Int32Array(STRIDE);
  function legalMoves() {
    const c = side, n = gen(c, false, tmp, 0), saved = tmp.slice(0, n), res = [];
    for (let i = 0; i < n; i++) {
      make(saved[i]);
      if (!inCheck(c)) res.push(saved[i]);
      undo();
    }
    return res;
  }

  // ---------------------------------------------------------------- 평가
  const wMinR = new Int8Array(10), bMaxR = new Int8Array(10), wCnt = new Int8Array(10), bCnt = new Int8Array(10);
  let insufficientFlag = false;
  function evaluate() {
    let m = mg, e = eg;
    wMinR.fill(8); bMaxR.fill(-1); wCnt.fill(0); bCnt.fill(0);
    let wMinor = 0, bMinor = 0, wMajor = 0, bMajor = 0, wB = 0, bB = 0, wPawns = 0, bPawns = 0, wNP = 0, bNP = 0;
    // 1차: 폰 위치와 기물 수 집계 (파일 인덱스는 +1 해서 양옆 참조가 안전하도록)
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (!p) continue;
      const f = (sq & 7) + 1, r = sq >> 4;
      switch (p) {
        case PAWN: wPawns++; wCnt[f]++; if (r < wMinR[f]) wMinR[f] = r; break;
        case -PAWN: bPawns++; bCnt[f]++; if (r > bMaxR[f]) bMaxR[f] = r; break;
        case KNIGHT: wMinor++; wNP += 300; break; case -KNIGHT: bMinor++; bNP += 300; break;
        case BISHOP: wMinor++; wB++; wNP += 300; break; case -BISHOP: bMinor++; bB++; bNP += 300; break;
        case ROOK: wMajor++; wNP += 500; break; case -ROOK: bMajor++; bNP += 500; break;
        case QUEEN: wMajor++; wNP += 900; break; case -QUEEN: bMajor++; bNP += 900; break;
      }
    }
    insufficientFlag = !wPawns && !bPawns && !wMajor && !bMajor && wMinor <= 1 && bMinor <= 1;
    if (insufficientFlag) return 0;
    // 2차: 폰 구조 + 룩 열린 파일
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq];
      if (p === PAWN) {
        const f = (sq & 7) + 1, r = sq >> 4;
        // 앞쪽(같은/인접 파일)에 흑 폰이 없으면 통과한 폰
        if (bMaxR[f - 1] <= r && bMaxR[f] <= r && bMaxR[f + 1] <= r) { m += PASS_MG[r]; e += PASS_EG[r]; }
        if (!wCnt[f - 1] && !wCnt[f + 1]) { m -= 10; e -= 15; }
      } else if (p === -PAWN) {
        const f = (sq & 7) + 1, r = sq >> 4;
        if (wMinR[f - 1] >= r && wMinR[f] >= r && wMinR[f + 1] >= r) { m -= PASS_MG[7 - r]; e -= PASS_EG[7 - r]; }
        if (!bCnt[f - 1] && !bCnt[f + 1]) { m += 10; e += 15; }
      } else if (p === ROOK || p === -ROOK) {
        const f = (sq & 7) + 1, own = p > 0 ? wCnt[f] : bCnt[f], opp = p > 0 ? bCnt[f] : wCnt[f];
        const bonus = !own ? (!opp ? 20 : 10) : 0;
        if (p > 0) m += bonus; else m -= bonus;
      }
    }
    for (let f = 1; f <= 8; f++) {                   // 겹폰
      if (wCnt[f] > 1) { m -= 10 * (wCnt[f] - 1); e -= 20 * (wCnt[f] - 1); }
      if (bCnt[f] > 1) { m += 10 * (bCnt[f] - 1); e += 20 * (bCnt[f] - 1); }
    }
    if (wB >= 2) { m += 30; e += 50; }
    if (bB >= 2) { m -= 30; e -= 50; }
    const ph = phase > 24 ? 24 : phase;
    let score = ((m * ph + e * (24 - ph)) / 24) | 0;
    // 폰 없이 기물 차이가 작으면 이기기 어려움 → 점수 축소
    if (score > 0 && !wPawns && wNP - bNP < 400) score >>= 2;
    else if (score < 0 && !bPawns && bNP - wNP < 400) score >>= 2;
    // 엔드게임 정리: 이기는 쪽 킹을 붙이고 지는 쪽 킹을 구석으로
    if (ph <= 8 && Math.abs(score) > 300) {
      const win = score > 0 ? 1 : -1, wk = kingSq[win + 1], lk = kingSq[-win + 1];
      const lf = lk & 7, lr = lk >> 4;
      const cd = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
      const kd = Math.abs((wk & 7) - lf) + Math.abs((wk >> 4) - lr);
      score += win * (cd * 10 + (14 - kd) * 4);
    }
    score += side * 10;                               // 두는 쪽 가산점
    return side === 1 ? score : -score;
  }

  function hasNonPawn(c) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = board[sq] * c;
      if (p > PAWN && p < KING) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- 탐색
  const TT_SIZE = 1 << 20, TT_MASK = TT_SIZE - 1;
  let ttLock = null, ttDepth, ttFlag, ttScore, ttMove;
  function ttAlloc() {
    if (ttLock) return;
    ttLock = new Int32Array(TT_SIZE); ttDepth = new Int8Array(TT_SIZE); ttFlag = new Int8Array(TT_SIZE).fill(-1);
    ttScore = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE);
  }
  const EXACT = 0, LOWER = 1, UPPER = 2;
  const moveBuf = new Int32Array(MAXPLY * STRIDE), scoreBuf = new Int32Array(MAXPLY * STRIDE);
  const killers = new Int32Array(MAXPLY * 2), history = new Int32Array(128 * 128);
  let nodes = 0, stopped = false, deadline = 0, iterDepth = 1;

  const toTT = (s, ply) => (s > MATE - MAXPLY ? s + ply : s < -MATE + MAXPLY ? s - ply : s);
  const fromTT = (s, ply) => (s > MATE - MAXPLY ? s - ply : s < -MATE + MAXPLY ? s + ply : s);
  function checkTime() { if ((nodes & 2047) === 0 && iterDepth > 1 && Date.now() > deadline) stopped = true; }

  function isRepeat() {
    for (let i = sp - 2, lim = Math.max(0, sp - half); i >= lim; i -= 2) if (stHi[i] === hHi && stLo[i] === hLo) return true;
    return false;
  }

  function orderMoves(n, base, ply, ttMv) {
    for (let i = 0; i < n; i++) {
      const m = moveBuf[base + i], f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7;
      const cap = board[t] || ((m >> 17) & F_EP ? PAWN : 0);
      let sc;
      if (m === ttMv) sc = 10000000;
      else if (cap || promo) sc = 1000000 + ORD[cap > 0 ? cap : -cap] * 16 - ORD[board[f] > 0 ? board[f] : -board[f]] + (promo === QUEEN ? 200 : 0);
      else if (m === killers[ply * 2]) sc = 900000;
      else if (m === killers[ply * 2 + 1]) sc = 800000;
      else sc = history[f * 128 + t];
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

  function quiesce(alpha, beta, ply) {
    nodes++; checkTime();
    if (stopped) return 0;
    const stand = evaluate();
    if (insufficientFlag) return 0;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= MAXPLY - 2) return stand;
    const c = side, base = ply * STRIDE;
    const n = gen(c, true, moveBuf, base);
    orderMoves(n, base, ply, 0);
    for (let i = 0; i < n; i++) {
      const m = pick(i, n, base), t = (m >> 7) & 127, cap = board[t];
      if (!((m >> 14) & 7) && cap && stand + VAL_EG[cap > 0 ? cap : -cap] + 200 < alpha) continue;   // 델타 가지치기
      make(m);
      if (inCheck(c)) { undo(); continue; }
      const score = -quiesce(-beta, -alpha, ply + 1);
      undo();
      if (stopped) return 0;
      if (score > alpha) { alpha = score; if (alpha >= beta) return alpha; }
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, allowNull) {
    nodes++; checkTime();
    if (stopped) return 0;
    const pvNode = beta - alpha > 1;
    if (half >= 100 || isRepeat()) return 0;
    if (ply >= MAXPLY - 4) return evaluate();
    if (alpha < -MATE + ply) alpha = -MATE + ply;     // 메이트 거리 가지치기
    if (beta > MATE - ply - 1) beta = MATE - ply - 1;
    if (alpha >= beta) return alpha;

    const c = side, inChk = inCheck(c);
    if (inChk) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);

    let ttMv = 0;
    const idx = hLo & TT_MASK;
    if (ttLock[idx] === hHi && ttFlag[idx] !== -1) {
      ttMv = ttMove[idx];
      if (!pvNode && ttDepth[idx] >= depth) {
        const s = fromTT(ttScore[idx], ply), fl = ttFlag[idx];
        if (fl === EXACT || (fl === LOWER && s >= beta) || (fl === UPPER && s <= alpha)) return s;
      }
    }

    let staticEval = 0;
    if (!pvNode && !inChk) {
      staticEval = evaluate();
      if (insufficientFlag) return 0;
      if (depth <= 3 && staticEval - 120 * depth >= beta && beta < MATE - MAXPLY) return staticEval;   // 역 퓨틸리티
      if (allowNull && depth >= 3 && staticEval >= beta && hasNonPawn(c)) {
        const R = depth >= 7 ? 3 : 2;
        makeNull();
        const s = -negamax(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        undo();
        if (stopped) return 0;
        if (s >= beta) return s >= MATE - MAXPLY ? beta : s;
      }
    }

    const base = ply * STRIDE, origAlpha = alpha;
    const n = gen(c, false, moveBuf, base);
    orderMoves(n, base, ply, ttMv);
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < n; i++) {
      const m = pick(i, n, base), t = (m >> 7) & 127;
      const quiet = board[t] === 0 && !((m >> 14) & 7) && !(((m >> 17) & 7) & F_EP);
      make(m);
      if (inCheck(c)) { undo(); continue; }
      legal++;
      const givesCheck = inCheck(side);
      if (!pvNode && !inChk && !givesCheck && quiet && depth <= 2 && legal > 1 && staticEval + 150 * depth < alpha) { undo(); continue; }   // 퓨틸리티
      let score;
      if (legal === 1) score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let r = 0;
        if (depth >= 3 && quiet && !inChk && !givesCheck && legal > 3 && m !== killers[ply * 2] && m !== killers[ply * 2 + 1]) {
          r = legal > 8 ? 2 : 1;
          if (depth >= 8) r++;
          if (pvNode) r--;
          if (r > depth - 2) r = depth - 2;
        }
        score = -negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && r > 0) score = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -negamax(depth - 1, -beta, -alpha, ply + 1, true);
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
              history[(m & 127) * 128 + t] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inChk ? -MATE + ply : 0;  // 체크메이트 / 스테일메이트
    if (best === -INF) return alpha;                  // 모든 수가 퓨틸리티로 잘림
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
      if (isRepeat()) break;
    }
    while (made--) undo();
    return pv;
  }

  /** 현재 국면에서 두는 쪽의 최선의 수 탐색. multiPV개의 후보를 정확한 점수로 돌려준다. */
  function search(opts) {
    ttAlloc();
    const timeMs = opts.timeMs || 2000, maxDepth = Math.min(opts.maxDepth || 40, MAXPLY - 10), K = opts.multiPV || 1;
    const onProgress = opts.onProgress || null;
    const t0 = Date.now();
    deadline = t0 + timeMs; stopped = false; nodes = 0; iterDepth = 1;
    killers.fill(0); history.fill(0);
    const rootSp = sp;
    let order = legalMoves();
    if (!order.length) return { lines: [], depth: 0, nodes: 0, elapsed: 0 };
    let result = { lines: [], depth: 0, nodes: 0, elapsed: 0 };

    for (let depth = 1; depth <= maxDepth; depth++) {
      iterDepth = depth;
      const top = [];
      let aborted = false;
      for (const m of order) {
        const full = top.length < K, bound = full ? -INF : top[K - 1].score;
        make(m);
        let score;
        if (full) score = -negamax(depth - 1, -INF, INF, 1, true);
        else {
          score = -negamax(depth - 1, -bound - 1, -bound, 1, true);
          if (!stopped && score > bound) score = -negamax(depth - 1, -INF, -bound, 1, true);
        }
        undo();
        if (stopped) { aborted = true; break; }
        if (full || score > bound) {
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
      if (Math.abs(top[0].score) > MATE - MAXPLY && depth >= 4) break;   // 메이트 확인됨
      if (order.length === 1 && depth >= 2) break;
      if (elapsed > timeMs * 0.45) break;
    }
    while (sp > rootSp) undo();
    return result;
  }

  // ---------------------------------------------------------------- 표기 / 대국 상태
  function san(m) {
    const f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7, fl = (m >> 17) & 7;
    const p = board[f], type = p > 0 ? p : -p;
    let s;
    if (fl & F_CASTLE) s = t > f ? 'O-O' : 'O-O-O';
    else {
      const isCap = board[t] !== 0 || (fl & F_EP);
      if (type === PAWN) {
        s = (isCap ? FILES[f & 7] + 'x' : '') + sqName(t) + (promo ? '=' + 'NBRQ'[promo - 2] : '');
      } else {
        s = 'NBRQK'[type - 2];
        const others = legalMoves().filter(o => o !== m && ((o >> 7) & 127) === t && board[o & 127] === p);
        if (others.length) {
          const sameFile = others.some(o => ((o & 127) & 7) === (f & 7));
          const sameRank = others.some(o => ((o & 127) >> 4) === (f >> 4));
          s += !sameFile ? FILES[f & 7] : !sameRank ? String((f >> 4) + 1) : sqName(f);
        }
        s += (isCap ? 'x' : '') + sqName(t);
      }
    }
    make(m);
    if (inCheck(side)) s += legalMoves().length ? '+' : '#';
    undo();
    return s;
  }

  function repetitions() {                            // 현재 국면이 나온 횟수 (현재 포함)
    let n = 1;
    for (let i = sp - 2, lim = Math.max(0, sp - half); i >= lim; i -= 2) if (stHi[i] === hHi && stLo[i] === hLo) n++;
    return n;
  }
  function insufficient() { evaluate(); return insufficientFlag; }

  function perft(d) {
    if (d === 0) return 1;
    const ms = legalMoves();
    if (d === 1) return ms.length;
    let n = 0;
    for (const m of ms) { make(m); n += perft(d - 1); undo(); }
    return n;
  }

  setFen(START_FEN);

  return {
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, MATE, MAXPLY, START_FEN, F_EP, F_CASTLE,
    setFen, getFen, make, undo, legalMoves, inCheck, search, san, perft, repetitions, insufficient, evaluate,
    getBoard: () => Int8Array.from(board),
    getSide: () => side,
    getHalf: () => half,
    getHash: () => hHi + ':' + hLo,
    sqName,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createChessEngine };
