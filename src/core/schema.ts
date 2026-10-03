import { Extension, Node } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/**
 * 가이드 문서의 모양. **서버가 받는 노드 · 속성이 정본이다** — README 의 "문서 모양" 표. 여기 있는
 * 확장은 편집기가 그 밖의 모양을 만들지 않게 한다.
 *
 * 이 파일은 앱(React Native)도 타입 검사한다. 앱에는 DOM 타입이 없으므로 WebView · 브라우저 안에서만
 * 부르는 DOM 함수는 좁게 적는다.
 */
type DomElement = {
  getAttribute: (name: string) => string | null;
  querySelector: (selector: string) => DomElement | null;
  style: { textAlign: string };
};

/** 사진 크기. 폭에 대한 비율이라 어느 화면에서나 같은 모양이다. 기본은 전체 폭이다 */
export type ImageSize = 'oneThird' | 'twoThirds' | 'full';

export type Align = 'left' | 'center' | 'right';

export const IMAGE_SIZES: readonly ImageSize[] = [
  'oneThird',
  'twoThirds',
  'full',
];
export const ALIGNS: readonly Align[] = ['left', 'center', 'right'];

/** 서버가 받는 한도 */
export const GUIDE_LIMITS = {
  /** 문서 형식 버전. 서버가 아는 버전만 받는다 */
  version: 1,
  photos: 20,
  /** 글 노드의 글자 수 합계 */
  chars: 10_000,
  /** 목록 중첩 단수 */
  listDepth: 3,
} as const;

/** 받을 수 있는 값이 아니면 기본값으로 읽는다 — 붙여 넣은 글의 `justify` 같은 것 */
export const oneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
  fallback: T,
): T => (values.includes(value as T) ? (value as T) : fallback);

/**
 * 가이드 사진. 서버가 아는 것은 `key` 이고 `src` 는 보여 주기 위한 주소다 — 저장할 때 빠진다
 * (`toServerDoc`). 사진은 맨 바깥 블록으로만 선다. 인용 · 주의 상자 · 목록 항목은 문단만 담으므로
 * 그 안에 들어갈 자리가 없다.
 */
export const GuideImage = Node.create({
  name: 'guideImage',
  group: 'block',
  atom: true,
  // 끌어서 옮기지 않는다. 손가락이 닿을 때마다 편집기가 포커스를 잡고, 멀리 끌면 자리가 틀린다.
  draggable: false,
  selectable: true,
  addAttributes() {
    return {
      key: { default: null },
      src: { default: null },
      size: { default: 'full' },
      align: { default: 'center' },
    };
  },
  // 우리가 그린 사진만 읽는다. 다른 곳에서 붙여 넣은 `<img>` 는 이 규칙에 걸리지 않아 떨어진다.
  parseHTML() {
    return [
      {
        tag: 'figure[data-guide-image]',
        getAttrs: node => {
          const element = node as unknown as DomElement;
          return {
            key: element.getAttribute('data-key'),
            src: element.querySelector('img')?.getAttribute('src') ?? null,
            size: oneOf(IMAGE_SIZES, element.getAttribute('data-size'), 'full'),
            align: oneOf(ALIGNS, element.getAttribute('data-align'), 'center'),
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'figure',
      {
        'data-guide-image': '',
        'data-key': node.attrs.key,
        'data-size': node.attrs.size,
        'data-align': node.attrs.align,
      },
      ['img', { src: node.attrs.src }],
    ];
  },
});

/**
 * 주의 상자. 문단을 감싸 "주의" 를 붙여 보인다 — 읽는 사람이 놓치면 안 되는 것을 적는다.
 * 안에는 문단만 둔다.
 */
export const GuideCallout = Node.create({
  name: 'guideCallout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML() {
    return ['div', { 'data-callout': '' }, 0];
  },
});

/** 문단 · 제목의 정렬. 왼쪽(기본)은 HTML 에 적지 않는다 */
export const GuideTextAlign = Extension.create({
  name: 'guideTextAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: 'left',
            parseHTML: element =>
              oneOf(
                ALIGNS,
                (element as unknown as DomElement).style.textAlign,
                'left',
              ),
            renderHTML: attributes =>
              attributes.textAlign === 'left'
                ? {}
                : { style: `text-align: ${attributes.textAlign}` },
          },
        },
      },
    ];
  },
});

const LIST_TYPES = ['bulletList', 'orderedList'];

/** 문서에서 가장 깊은 목록 중첩 단수 */
export const deepestList = (node: ProseMirrorNode, depth = 0): number => {
  const here = LIST_TYPES.includes(node.type.name) ? depth + 1 : depth;
  let deepest = here;
  node.forEach(child => {
    deepest = Math.max(deepest, deepestList(child, here));
  });
  return deepest;
};

/** 목록을 3단보다 깊게 만드는 변경을 받지 않는다 — 들여쓰기 · 붙여 넣기 모두 */
export const GuideListDepth = Extension.create({
  name: 'guideListDepth',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: transaction =>
          !transaction.docChanged ||
          deepestList(transaction.doc) <= GUIDE_LIMITS.listDepth,
      }),
    ];
  },
});

/**
 * Tiptap 기본 확장이 서버보다 넓게 받는 자리를 좁힌다. **값이 문자열이라 설정으로 넘길 수 있다** —
 * 10tap 은 확장 설정을 JSON 으로 WebView 에 보낸다. 웹처럼 Tiptap 을 바로 쓰는 쪽은
 * `Blockquote.extend(GUIDE_CONTENT.blockquote)` 처럼 쓴다.
 *
 * 번호 목록의 `type` 속성은 설정으로 뺄 수 없어 저장할 때 뺀다 (`toServerDoc`).
 */
export const GUIDE_CONTENT = {
  blockquote: { content: 'paragraph+' },
  listItem: { content: 'paragraph (bulletList | orderedList)*' },
} as const;

/** 형광펜은 한 가지 색이다. 색은 문서 CSS 가 정한다 */
export const GUIDE_HIGHLIGHT = { multicolor: false } as const;
