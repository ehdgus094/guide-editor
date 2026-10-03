import { createRoot } from 'react-dom/client';

import { GuideEditor } from './GuideEditor';

declare global {
  interface Window {
    contentInjected: boolean | undefined;
  }
}

/**
 * 앱이 주입하는 설정(`window.initialContent` 등)이 들어온 뒤에 편집기를 그린다. 안드로이드
 * WebView 는 문서를 연 뒤에 주입하는 때가 있다 (react-native-webview #2960).
 */
const interval = setInterval(() => {
  if (!window.contentInjected) {
    return;
  }
  createRoot(document.getElementById('root')!).render(<GuideEditor />);
  clearInterval(interval);
}, 1);
