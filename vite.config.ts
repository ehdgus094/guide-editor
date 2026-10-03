import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 앱 WebView 안에서 도는 편집기를 HTML 한 파일로 묶는다. `scripts/wrap-html.mjs` 가 그것을 앱이
 * import 하는 문자열(`dist/webview.js`)로 옮긴다.
 *
 * 10tap 의 웹 번들이 Tiptap 과 ProseMirror 를 품고 있다. 같은 것을 node_modules 에서 한 번 더
 * 읽으면 선택 · 상태 객체가 둘로 갈라져 `instanceof` 가 틀리므로 그 셋을 웹 번들로 돌린다.
 */
export default defineConfig({
  root: 'src/webview',
  build: {
    outDir: '../../dist/html',
    emptyOutDir: true,
  },
  resolve: {
    // 10tap 이 자기 의존성으로 react-dom 18 을 따로 갖고 있다. 그것을 집으면 react 19 와 섞여
    // 실행 중에 깨지므로 react · react-dom 은 루트의 한 벌만 쓴다.
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@10play/tentap-editor',
        replacement: '@10play/tentap-editor/web',
      },
      { find: '@tiptap/pm/view', replacement: '@10play/tentap-editor/web' },
      { find: '@tiptap/pm/state', replacement: '@10play/tentap-editor/web' },
    ],
  },
  plugins: [react(), viteSingleFile()],
});
