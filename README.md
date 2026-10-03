# guide-editor

사진 · 주의 상자가 들어가는 가이드 문서 편집기. **웹과 React Native 앱이 같은 문서를 만들고 같은
모양으로 그리도록 한 곳에 둔다.** 코드가 두 벌이면 서버가 받는 모양과 보이는 모양이 갈라진다.

문서 모양의 정본은 아래 "문서 모양" 표다 — 서버가 이 모양만 받는다. 이 패키지는 편집기가 그 밖의
모양을 만들지 않게 하고, 서버에 보낼 모양으로 바꾼다.

## 가져오는 법

각 저장소가 태그를 고정해 git 의존성으로 받는다. 원격에서 받아 쓰는 배포는 없다.

```json
"@ehdgus094/guide-editor": "github:ehdgus094/guide-editor#v0.1.0"
```

받을 때 `prepare` 가 WebView 용 HTML 을 빌드한다(`dist/webview.js`). 쓰는 쪽에 웹 빌드 도구가 필요 없다.
`core` · `bridge` 는 TypeScript 소스 그대로 나가고 쓰는 쪽 번들러가 옮긴다.

## 무엇이 있나

| import | 무엇 | 누가 |
|---|---|---|
| `@ehdgus094/guide-editor/core` | 스키마와 확장(사진 · 주의 상자 · 정렬 · 목록 깊이), 문서 CSS(`guideDocumentCss`), 서버 모양 변환(`toServerDoc` · `fromServerDoc` · `measureDoc` · `replaceImageKeys`), 한도(`GUIDE_LIMITS`) | 웹 · 앱 |
| `@ehdgus094/guide-editor/bridge` | 10tap 연결 — `GUIDE_BRIDGES` 와 사진 넣기 · 블록 옮기기 · 크기 · 정렬 · 한글 조합을 끝내고 서식 바꾸기 명령, 툴바가 읽을 상태 | 앱 |
| `@ehdgus094/guide-editor/webview` | 앱 WebView 에 띄울 페이지(`editorHtml`). 편집과 읽기 전용이 같은 페이지다 | 앱 |

**툴바는 각자 그린다.** 데스크톱 마우스와 모바일 키보드는 조작이 다르다.

### 앱 (React Native · 10tap)

```ts
import { PlaceholderBridge, useEditorBridge } from '@10play/tentap-editor';
import { GUIDE_BRIDGES, GuideBridge } from '@ehdgus094/guide-editor/bridge';
import { guideDocumentCss } from '@ehdgus094/guide-editor/core';
import { editorHtml } from '@ehdgus094/guide-editor/webview';

const bridges = GUIDE_BRIDGES.map(bridge =>
  bridge.name === PlaceholderBridge.name
    ? bridge.configureExtension({ placeholder: '…' })
    : bridge.name === GuideBridge.name
      ? bridge.configureCSS(guideDocumentCss(theme))
      : bridge,
);

useEditorBridge({ customSource: editorHtml, bridgeExtensions: bridges, initialContent });
```

읽기 전용은 같은 페이지에 `editable: false` · `dynamicHeight: true` 를 준다.

### 웹 (Tiptap 을 바로 쓴다)

`core` 의 확장을 Tiptap 기본 확장과 함께 넣는다. 기본 확장 중 서버보다 넓게 받는 둘은 좁힌다.

```ts
Blockquote.extend(GUIDE_CONTENT.blockquote);
ListItem.extend(GUIDE_CONTENT.listItem);
Highlight.configure(GUIDE_HIGHLIGHT);
```

저장할 때는 늘 `toServerDoc` 을 거친다 — 번호 목록의 `type` 과 사진의 `src` 가 빠진다.

## 문서 모양

맨 바깥은 `{"type": "doc", "content": [...]}` 이고 비어 있어도 된다. 아래 밖의 노드 · 마크 · 속성
값은 서버가 받지 않는다.

| 노드 | 속성 | 안에 둘 수 있는 것 |
|---|---|---|
| `paragraph` | `textAlign`: left · center · right | 글 · `hardBreak` |
| `heading` | `level`: 1~6 (필수), `textAlign` | 글 · `hardBreak` |
| `bulletList` · `orderedList` | `orderedList` 만 `start`(1 이상) | `listItem` 1개 이상 |
| `listItem` | — | `paragraph` 하나, 그 뒤에 목록 0개 이상. 목록 중첩은 3단까지 |
| `blockquote` · `guideCallout`(주의 상자) | — | `paragraph` 1개 이상 |
| `guideImage`(사진) | `key` · `size` · `align` — 셋 다 필수 | 없다 |
| `hardBreak` | — | 없다 |
| `text` | 빈 글은 안 된다. 마크: bold · italic · underline · strike · highlight (마크에 속성 없음) | — |

- 사진의 `size` 는 oneThird · twoThirds · full, `align` 은 left · center · right 다
- 사진은 맨 바깥 블록으로만 둔다. 목록 · 인용 · 주의 상자 안에 두지 않는다
- `key` 는 사진 저장소의 객체 키다. URL 을 문서에 써 넣지 않는다 — 보여 줄 주소는 `fromServerDoc` 이 붙인다
- 사진 20장 · 글(글 노드의 글자 수 합계) 10,000자까지 (`GUIDE_LIMITS`)

## 붙여 넣기

다른 앱에서 붙여 넣은 글은 스키마에 맞춰 걸러진다 — 인용 · 주의 상자 · 목록 안의 사진과 제목은 밖으로
나오고, 링크 · 코드 · 표는 글자만 남고, 바깥 `<img>` 는 떨어진다. **목록이 3단보다 깊은 글은 통째로
붙지 않는다** — 줄여서 붙일 방법은 아직 없다.

## 개발

```bash
npm install
npm run typecheck   # core · bridge 는 DOM 없이, webview 는 DOM 과 함께
npm run build       # dist/webview.js
```

**버전을 올리면 태그를 단다.** 쓰는 쪽은 태그로 받으므로 태그가 없으면 바뀐 것이 닿지 않는다.
메시지 규칙(앱이 보내는 명령 · 받는 상태)을 바꾸면 앱도 함께 올려야 한다 — 앱 쪽 명령과 WebView 쪽
처리가 같은 버전에서 짝을 이룬다.

## 라이선스

`LICENSE` 를 본다. 이 저장소는 공개돼 있지만 코드를 쓰거나 고치거나 배포할 권리는 주지 않는다.
