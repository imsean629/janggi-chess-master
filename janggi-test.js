// 실행: node web/janggi-test.js  — 규칙 / 장군 판정 / 탐색 검증
const { createEngine } = require('./janggi-engine.js');
const E = createEngine();
const { KING, ADV, ELE, HOR, CHA, CAN, SOL } = E;
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };
const sq = (x, y) => y * 9 + x;
const name = s => `${s % 9},${(s / 9) | 0}`;
const pos = (list, side = 1) => {
  const b = new Int8Array(90);
  for (const [x, y, p] of list) b[sq(x, y)] = p;
  E.setPosition(b, side);
};
const targets = (x, y) => E.legalMoves().filter(m => (m & 127) === sq(x, y)).map(m => name(m >> 7)).sort();
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify([...want].sort()), `${msg}: got ${JSON.stringify(got)} want ${JSON.stringify([...want].sort())}`);
const kings = [[3, 8, KING], [5, 1, -KING]];   // 서로 다른 줄(빅장 아님), 궁성 모서리

// 마
pos([...kings, [4, 5, HOR]]);
eq(targets(4, 5), ['3,3', '5,3', '2,4', '6,4', '2,6', '6,6', '3,7', '5,7'], '마 자유');
pos([...kings, [4, 5, HOR], [4, 4, -SOL]]);
eq(targets(4, 5), ['2,4', '6,4', '2,6', '6,6', '3,7', '5,7'], '마 다리 막힘');
// 상
pos([...kings, [4, 5, ELE]]);
eq(targets(4, 5), ['2,2', '6,2', '1,3', '7,3', '1,7', '7,7', '2,8', '6,8'], '상 자유');
pos([...kings, [4, 5, ELE], [3, 3, -SOL]]);
eq(targets(4, 5), ['6,2', '1,3', '7,3', '1,7', '7,7', '2,8', '6,8'], '상 두번째 길 막힘');
pos([...kings, [4, 5, ELE], [4, 4, -SOL]]);
ok(!targets(4, 5).includes('2,2') && !targets(4, 5).includes('6,2'), '상 첫 길 막힘 → 위쪽 불가');
// 차: 직선 + 궁성 대각선
pos([[3, 9, KING], [5, 0, -KING], [0, 5, CHA]]);
ok(targets(0, 5).includes('0,0') && targets(0, 5).includes('8,5') && targets(0, 5).includes('0,9'), '차 직선');
pos([[4, 9, KING], [4, 0, -KING], [3, 0, CHA]]);        // 초의 차가 한 궁성 모서리
eq(targets(3, 0).filter(t => ['4,1', '5,2'].includes(t)), ['4,1', '5,2'], '차 궁성 대각선');
pos([[4, 9, KING], [4, 0, -KING], [3, 0, CHA], [4, 1, -SOL]]);
eq(targets(3, 0).filter(t => ['4,1', '5,2'].includes(t)), ['4,1'], '차 대각선 막힘(잡기)');
// 포
pos([...kings, [0, 5, CAN], [0, 3, SOL], [0, 1, -SOL]]);
eq(targets(0, 5).filter(t => t.startsWith('0,') && +t.split(',')[1] < 3), ['0,1', '0,2'], '포 넘기');
pos([...kings, [0, 5, CAN], [0, 3, CAN], [0, 1, -SOL]]);
eq(targets(0, 5).filter(t => t.startsWith('0,') && +t.split(',')[1] < 4), [], '포는 포를 못 넘음');
pos([...kings, [0, 5, CAN], [0, 3, SOL], [0, 1, -CAN]]);
eq(targets(0, 5).filter(t => t.startsWith('0,') && +t.split(',')[1] < 3), ['0,2'], '포는 포를 못 잡음');
pos([[4, 9, KING], [4, 0, -KING], [3, 0, CAN], [4, 1, -SOL]]);
ok(targets(3, 0).includes('5,2'), '궁성 대각선 포 넘기');
// 졸 (초는 위로), 궁성 안 대각선
pos([...kings, [4, 5, SOL]]);
eq(targets(4, 5), ['4,4', '3,5', '5,5'], '초 졸');
pos([[4, 9, KING], [4, 0, -KING], [3, 2, SOL]]);
eq(targets(3, 2), ['3,1', '2,2', '4,2', '4,1'], '졸 궁성 대각선 전진');
pos([...kings, [4, 3, -SOL]], -1);
eq(targets(4, 3), ['4,4', '3,3', '5,3'], '한 병은 아래로');
// 사/궁
pos([[4, 8, KING], [5, 1, -KING], [3, 9, ADV]]);
eq(targets(3, 9), ['3,8', '4,9'], '사 (대각선 칸은 자기 궁이 차지)');
// 장군 판정: 차/포/마/상/졸
pos([[4, 9, KING], [3, 0, -KING], [4, 3, -CHA]]);
ok(E.inCheck(1), '차 장군');
pos([[4, 9, KING], [3, 0, -KING], [4, 3, -CAN], [4, 6, SOL]]);
ok(E.inCheck(1), '포 장군');
pos([[4, 9, KING], [3, 0, -KING], [4, 3, -CAN]]);
ok(!E.inCheck(1), '받침 없는 포는 장군 아님');
pos([[4, 9, KING], [3, 0, -KING], [4, 3, -CAN], [4, 6, -CAN]]);
ok(!E.inCheck(1), '포끼리 받침 불가');
pos([[4, 8, KING], [3, 0, -KING], [3, 6, -HOR]]);
ok(E.inCheck(1), '마 장군');
pos([[4, 8, KING], [3, 0, -KING], [3, 6, -HOR], [3, 7, SOL]]);
ok(!E.inCheck(1), '마 다리 막힘 → 장군 아님');
pos([[4, 9, KING], [3, 0, -KING], [4, 8, -SOL]]);
ok(E.inCheck(1), '병 장군(앞)');
pos([[4, 9, KING], [3, 0, -KING], [3, 9, -SOL]]);
ok(E.inCheck(1), '병 장군(옆)');
pos([[4, 8, KING], [3, 0, -KING], [3, 7, -CHA]]);
ok(E.inCheck(1), '궁성 대각선 차 장군');
pos([[5, 9, KING], [3, 0, -KING], [4, 8, ADV], [3, 7, -CAN]]);
ok(E.inCheck(1), '궁성 대각선 포 장군');
// 빅장
pos([[4, 8, KING], [4, 1, -KING]]);
ok(E.facing(), '빅장');
pos([[4, 8, KING], [4, 1, -KING], [4, 5, SOL]]);
ok(!E.facing(), '사이에 기물');
// 초기 배치: 궁이 살아있고 수가 있다
for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
  E.setPosition(E.makeStart(a, b), 1);
  const n = E.legalMoves().length;
  ok(n > 20 && n < 60, `초기 배치 ${a},${b}: 합법 수 ${n}`);
  ok(!E.inCheck(1) && !E.inCheck(-1) && !E.facing(), '초기 배치 안전');
}

// 무작위 대국 퍼즈: inCheck ≡ 상대의 의사합법 수가 궁을 잡을 수 있음
let seed = 12345; const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
let checks = 0, positions = 0;
for (let g = 0; g < 200; g++) {
  E.setPosition(E.makeStart(rand(4), rand(4)), 1);
  for (let ply = 0; ply < 120; ply++) {
    const b = E.getBoard(), s = E.getSide();
    positions++;
    for (const c of [1, -1]) {
      const kingSq = b.findIndex(p => p === c * KING);
      ok(kingSq >= 0, '궁이 사라짐');
      const brute = E.pseudoMoves(-c).some(m => (m >> 7) === kingSq);
      // pseudoMoves는 side와 무관하게 -c 기물만 생성; 그러나 make는 안 하므로 안전
      if (brute) checks++;
      ok(brute === E.inCheck(c), `inCheck 불일치 g${g} ply${ply} c${c}`);
    }
    const legal = E.legalMoves();
    if (!legal.length) break;
    E.make(legal[rand(legal.length)]);
  }
}
console.log(`퍼즈: ${positions}개 국면, 장군 ${checks}회`);

// 탐색: 공짜 차 잡기
pos([[5, 9, KING], [3, 0, -KING], [0, 5, CHA], [0, 1, -CHA], [8, 5, SOL]]);
let r = E.search({ timeMs: 500, maxDepth: 4, multiPV: 2 });
ok((r.lines[0].move & 127) === sq(0, 5) && (r.lines[0].move >> 7) === sq(0, 1), `차로 차 잡기 추천 (got ${name(r.lines[0].move & 127)}→${name(r.lines[0].move >> 7)})`);
// 탐색: 1수 외통
pos([[4, 9, KING], [3, 0, -KING], [4, 1, -ADV], [3, 1, -ADV], [0, 4, CHA], [5, 2, CHA]]);
r = E.search({ timeMs: 800, maxDepth: 8, multiPV: 1 });
ok(r.lines[0].score === E.MATE - 1, `1수 외통 발견 (score ${r.lines[0].score})`);
// 궁이 잡힐 위기: 방어 수를 찾아야 함 (차 장군을 피하는 수만 추천)
pos([[4, 9, KING], [3, 0, -KING], [4, 5, -CHA], [8, 6, SOL]]);
r = E.search({ timeMs: 500, maxDepth: 4, multiPV: 3 });
ok(r.lines.every(l => { E.make(l.move); const bad = E.inCheck(1); E.undo(); return !bad; }), '장군 상태에서 장군을 벗어나는 수만 추천');

// 자체 대국: 불법수/크래시 없이 진행되는지 + 속도
const t0 = Date.now(); let totalNodes = 0, plies = 0;
E.setPosition(E.makeStart(0, 0), 1);
for (let ply = 0; ply < 60; ply++) {
  const res = E.search({ timeMs: 150, maxDepth: 6, multiPV: 1 });
  if (!res.lines.length) break;
  const m = res.lines[0].move;
  ok(E.legalMoves().includes(m), '추천 수가 합법이 아님');
  totalNodes += res.nodes; plies++;
  E.make(m);
}
console.log(`자체 대국 ${plies}수, 평균 깊이 탐색 노드 합 ${totalNodes}, ${(totalNodes / ((Date.now() - t0) / 1000) / 1000).toFixed(0)}k nps`);
console.log(fail ? `실패 ${fail}건` : '모든 테스트 통과');
process.exit(fail ? 1 : 0);
