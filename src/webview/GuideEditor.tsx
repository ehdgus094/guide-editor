import { EditorContent } from '@tiptap/react';
import { useTenTap } from '@10play/tentap-editor';

import { GUIDE_BRIDGES } from '../bridge';

/**
 * WebView 안의 편집기. 어떤 서식과 노드를 켤지는 앱과 함께 읽는 `GUIDE_BRIDGES` 가 정한다. 읽기
 * 전용으로 쓸 때도 같은 페이지다 — 앱이 `editable: false` 를 주입한다. 그래야 보는 모양이 편집한
 * 모양과 같다.
 */
export const GuideEditor = () => {
  const editor = useTenTap({ bridges: GUIDE_BRIDGES });

  return (
    <EditorContent
      editor={editor}
      className={window.dynamicHeight ? 'dynamic-height' : undefined}
    />
  );
};
