// 묶은 HTML 을 앱이 import 하는 문자열 모듈로 옮긴다. 10tap 의 `customSource` 가 이 문자열을 받는다.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/html/index.html', 'utf8');

writeFileSync(
  'dist/webview.js',
  `/** 가이드 편집기 페이지. 편집과 읽기 전용이 같은 페이지다 */\nexport const editorHtml = ${JSON.stringify(html)};\n`,
);
writeFileSync(
  'dist/webview.d.ts',
  '/** 가이드 편집기 페이지. 편집과 읽기 전용이 같은 페이지다 */\nexport declare const editorHtml: string;\n',
);
