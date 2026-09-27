// 실행: node web/chess-test.js  — 수 생성(perft) / 표기 / 무승부 / 탐색 검증
const { createChessEngine } = require('./chess-engine.js');
const E = createChessEngine();
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };
const sanOf = m => E.san(m);
const find = s => E.legalMoves().find(m => E.san(m).replace(/[+#]/, '') === s.replace(/[+#]/, ''));
const playSan = list => { for (const s of list) { const m = find(s); if (m === undefined) throw new Error('수 없음: ' + s + ' @ ' + E.getFen()); E.make(m); } };

// perft: 널리 쓰이는 검증 국면들
const PERFT = [
  [E.START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];
const t0 = Date.now();
for (const [fen, counts] of PERFT) {
  ok(E.setFen(fen), 'FEN 읽기 ' + fen);
  const hash = E.getHash();
  counts.forEach((want, i) => { const got = E.perft(i + 1); ok(got === want, `perft(${i + 1}) ${fen}: got ${got} want ${want}`); });
  ok(E.getHash() === hash, 'perft 후 해시 복원');
  ok(E.getFen() === fen, `FEN 왕복: ${E.getFen()}`);
}
console.log(`perft ${Date.now() - t0}ms`);

// 해시 일관성: 무작위 대국 중 증분 해시 == FEN에서 다시 만든 해시
let seed = 7; const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const F = createChessEngine();
for (let g = 0; g < 100; g++) {
  E.setFen(E.START_FEN);
  for (let ply = 0; ply < 150; ply++) {
    const ms = E.legalMoves();
    if (!ms.length) break;
    E.make(ms[rand(ms.length)]);
    F.setFen(E.getFen());
    if (F.getHash() !== E.getHash()) { ok(false, `해시 불일치 g${g} ply${ply} ${E.getFen()}`); break; }
  }
}

// 표기(SAN)
E.setFen(E.START_FEN);
playSan(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O']);
ok(E.getFen().startsWith('r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5'), '루이 로페즈 FEN: ' + E.getFen());
E.setFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
ok(E.legalMoves().map(sanOf).includes('O-O-O'), '퀸사이드 캐슬링 표기');
E.setFen('k7/8/8/8/8/8/8/1R1R3K w - - 0 1');
ok(E.legalMoves().map(sanOf).includes('Rbc1') && E.legalMoves().map(sanOf).includes('Rdc1'), '같은 기물 구분 표기');
E.setFen('k7/4P3/8/8/8/8/8/7K w - - 0 1');
ok(['e8=Q+', 'e8=N', 'e8=R+', 'e8=B'].every(s => E.legalMoves().map(sanOf).includes(s)), '프로모션 표기: ' + E.legalMoves().map(sanOf));
E.setFen('rnbqkbnr/ppppp2p/5p2/6p1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq g6 0 3');
ok(E.legalMoves().map(sanOf).includes('Qh5#'), '메이트 표기 #');

// 무승부 판정
E.setFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
ok(E.legalMoves().length === 0 && !E.inCheck(-1), '스테일메이트');
E.setFen('8/8/4k3/8/8/3NK3/8/8 w - - 0 1');
ok(E.insufficient(), '기물 부족(K+N vs K)');
E.setFen(E.START_FEN);
playSan(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
ok(E.repetitions() === 3, '3회 반복: ' + E.repetitions());

// 탐색
const best = (fen, ms = 1500) => { E.setFen(fen); const r = E.search({ timeMs: ms, multiPV: 1 }); return { san: E.san(r.lines[0].move), score: r.lines[0].score, depth: r.depth, nodes: r.nodes, t: r.elapsed }; };
let r = best('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
ok(r.san === 'Rd8#' && r.score === E.MATE - 1, `1수 메이트: ${JSON.stringify(r)}`);
r = best('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
ok(r.san === 'Qxf7#', `스콜라 메이트: ${JSON.stringify(r)}`);
r = best('2r3k1/p4p2/3Rp2p/1p2P1pK/8/1P4P1/P3Q2P/1q6 b - - 0 1', 3000);
ok(r.san === 'Qg6+' || r.score > E.MATE - 100, `2수 메이트 계열: ${JSON.stringify(r)}`);
r = best('4k3/8/8/8/8/8/3q4/R3K3 w Q - 0 1');
ok(r.san === 'Kxd2', `퀸 잡기: ${JSON.stringify(r)}`);
r = best('8/8/8/8/8/2k5/8/K1Q5 w - - 0 1');
ok(r.score > 500, `K+Q vs K 우세 인식: ${JSON.stringify(r)}`);

// 자체 대국: 추천 수가 항상 합법이고 크래시 없음
E.setFen(E.START_FEN);
const t1 = Date.now(); let nodes = 0, plies = 0; const game = [];
for (let ply = 0; ply < 80; ply++) {
  const res = E.search({ timeMs: 120, multiPV: 1 });
  if (!res.lines.length || E.repetitions() >= 3 || E.getHalf() >= 100 || E.insufficient()) break;
  const m = res.lines[0].move;
  ok(E.legalMoves().includes(m), '추천 수가 합법이 아님');
  game.push(E.san(m)); nodes += res.nodes; plies++;
  E.make(m);
}
console.log(`자체 대국 ${plies}수, ${(nodes / ((Date.now() - t1) / 1000) / 1000).toFixed(0)}k nps`);
console.log(game.slice(0, 20).join(' '));
console.log(fail ? `실패 ${fail}건` : '모든 테스트 통과');
process.exit(fail ? 1 : 0);
