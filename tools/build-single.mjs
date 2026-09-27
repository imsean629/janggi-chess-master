// web/ 폴더의 장기·체스 마스터를 HTML 파일 하나로 합친다.
// 실행: node tools/build-single.mjs   →  장기체스마스터.html (프로젝트 루트)
//
// 한 파일 안에서 첫 화면 / 장기 / 체스를 주소의 # 부분(#janggi, #chess)으로 전환한다.
// 각 화면의 본문은 <template>로 넣어 두고, 전환할 때 body에 복제한 뒤 해당 앱을 시작한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const read = f => readFileSync(join(web, f), 'utf8');
const OUT = join(root, '장기체스마스터.html');

// 원본 문자열을 바꾸되, 바꿀 대상이 없으면(원본이 달라졌으면) 빌드를 멈춘다
function replaceOnce(src, from, to, what) {
  if (!src.includes(from)) throw new Error(`빌드 실패: ${what}에서 "${from.slice(0, 60)}"을(를) 찾지 못함`);
  return src.split(from).join(to);
}
function bodyOf(html, file) {
  const m = html.match(/<body([^>]*)>([\s\S]*)<\/body>/);
  if (!m) throw new Error(`빌드 실패: ${file}에 <body>가 없음`);
  const cls = (m[1].match(/class="([^"]*)"/) || [])[1] || '';
  return { cls, html: m[2].replace(/<script[\s\S]*?<\/script>\s*/g, '').trim() };
}
const guard = s => { if (/<\/script/i.test(s)) throw new Error('빌드 실패: 스크립트 안에 </script 문자열이 있음'); return s; };

// ---- 화면 본문
const landing = bodyOf(read('index.html'), 'index.html');
landing.html = replaceOnce(landing.html, 'href="janggi.html"', 'href="#janggi"', 'index.html');
landing.html = replaceOnce(landing.html, 'href="chess.html"', 'href="#chess"', 'index.html');
landing.html = replaceOnce(landing.html, "휴대폰에서는 브라우저 메뉴의 ‘홈 화면에 추가’로 앱처럼 쓸 수 있어요.", '인터넷 없이도 이 파일 하나로 동작해요.', 'index.html');
const janggi = bodyOf(read('janggi.html'), 'janggi.html');
const chess = bodyOf(read('chess.html'), 'chess.html');
for (const page of [janggi, chess]) page.html = replaceOnce(page.html, 'href="index.html"', 'href="#"', '게임 화면');

// ---- 스크립트: 서비스 워커 등록 제거, 처음 화면 이동을 # 전환으로
const SW_LINE = "    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});\n";
let janggiApp = read('janggi-app.js'), chessApp = read('chess-app.js');
janggiApp = replaceOnce(janggiApp, SW_LINE, '', 'janggi-app.js');
chessApp = replaceOnce(chessApp, SW_LINE, '', 'chess-app.js');
janggiApp = replaceOnce(janggiApp, "location.href = 'index.html';", "location.hash = '';", 'janggi-app.js');
chessApp = replaceOnce(chessApp, "location.href = 'index.html';", "location.hash = '';", 'chess-app.js');

// ---- 아이콘은 파일 안에 데이터로
const favicon = 'data:image/svg+xml,' + encodeURIComponent(read('icon.svg'));
const touchIcon = 'data:image/png;base64,' + readFileSync(join(web, 'icon-192.png')).toString('base64');

const router = `
(function () {
  'use strict';
  const VIEWS = {
    '': { tpl: 'tpl-home', cls: '', title: '장기·체스 마스터', boot: bootHome },
    janggi: { tpl: 'tpl-janggi', cls: '', title: '장기 마스터', boot: bootJanggi, app: '__janggi' },
    chess: { tpl: 'tpl-chess', cls: 'chess', title: '체스 마스터', boot: bootChess, app: '__chess' },
  };
  let current = null;
  function route() {
    const key = location.hash.slice(1);
    const view = VIEWS[key] || VIEWS[''];
    if (current && current.app && window[current.app]) { window[current.app].stop(); window[current.app] = null; }   // 계산 중인 엔진 중지
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    document.body.className = view.cls;
    document.body.replaceChildren(document.getElementById(view.tpl).content.cloneNode(true));
    document.title = view.title;
    current = view;
    view.boot();
    window.scrollTo(0, 0);
  }
  function bootHome() {
    const show = (key, id) => {
      try {
        const s = JSON.parse(localStorage.getItem(key));
        if (s && s.moves && s.moves.length) { const el = document.getElementById(id); el.textContent = '진행 중인 대국 ' + s.moves.length + '수'; el.hidden = false; }
      } catch (e) { /* 저장소를 못 쓰면 표시만 생략 */ }
    };
    show('janggi-master-v1', 'saved-janggi');
    show('chess-master-v1', 'saved-chess');
  }
  window.addEventListener('hashchange', route);
  route();
})();`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1f5f3a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<!-- 자동 생성 파일: 원본은 web/ 폴더, 다시 만들기는 node tools/build-single.mjs -->
<title>장기·체스 마스터</title>
<link rel="icon" href="${favicon}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${touchIcon}">
<style>
${read('style.css')}
</style>
<template id="tpl-home">
${landing.html}
</template>
<template id="tpl-janggi">
${janggi.html}
</template>
<template id="tpl-chess">
${chess.html}
</template>
<script>
${guard(read('janggi-engine.js'))}
</script>
<script>
${guard(read('chess-engine.js'))}
</script>
<script>
function bootJanggi() {
${guard(janggiApp)}
}
function bootChess() {
${guard(chessApp)}
}
</script>
</head>
<body>
<script>${guard(router)}
</script>
</body>
</html>
`;
writeFileSync(OUT, html);
console.log(`만들었음: ${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
