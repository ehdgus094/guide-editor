import type { JSONContent } from '@tiptap/core';

import { ALIGNS, IMAGE_SIZES, oneOf } from './schema';

/**
 * 편집기 문서와 서버 문서 사이의 변환. **이 패키지를 쓰는 곳들이 서버에 보내는 모양이 갈라지지 않게
 * 하는 자리다.**
 *
 * | 편집기 | 서버 |
 * |---|---|
 * | 사진에 보여 주기 위한 `src` 가 있다 | `key` · `size` · `align` 만 |
 * | 번호 목록에 `type`(기본 `null`) 이 있다 | `start` 만 |
 * | 마크에 속성이 붙을 수 있다(형광펜 색) | 마크에 속성이 없다 |
 * | 붙여 넣은 글에 다른 마크가 섞일 수 있다 | 굵게 · 기울임 · 밑줄 · 취소선 · 형광펜만 |
 */

/** 서버가 받는 문서. 맨 바깥은 `doc` 이고 비어 있어도 된다 */
export type GuideDoc = { type: 'doc'; content: JSONContent[] };

export const EMPTY_GUIDE_DOC: GuideDoc = { type: 'doc', content: [] };

const ATTRS: Record<string, (attrs: Record<string, unknown>) => object> = {
  paragraph: attrs => ({ textAlign: oneOf(ALIGNS, attrs.textAlign, 'left') }),
  heading: attrs => ({
    level: attrs.level,
    textAlign: oneOf(ALIGNS, attrs.textAlign, 'left'),
  }),
  orderedList: attrs => ({ start: attrs.start ?? 1 }),
  guideImage: attrs => ({
    key: attrs.key,
    size: oneOf(IMAGE_SIZES, attrs.size, 'full'),
    align: oneOf(ALIGNS, attrs.align, 'center'),
  }),
};

/** 서버가 받는 마크. 이 밖의 마크는 글자만 남기고 뗀다 */
const MARKS = ['bold', 'italic', 'underline', 'strike', 'highlight'];

const toServerNode = (node: JSONContent): JSONContent | null => {
  // 빈 글은 서버가 받지 않는다. 편집기는 만들지 않지만 붙여 넣은 문서에 섞여 올 수 있다.
  if (node.type === 'text' && !node.text) {
    return null;
  }
  const result: JSONContent = { type: node.type };
  const pick = node.type ? ATTRS[node.type] : undefined;
  if (pick) {
    result.attrs = pick(node.attrs ?? {});
  }
  if (node.text !== undefined) {
    result.text = node.text;
  }
  const marks = (node.marks ?? []).filter(mark => MARKS.includes(mark.type));
  if (marks.length) {
    result.marks = marks.map(mark => ({ type: mark.type }));
  }
  if (node.content) {
    result.content = node.content
      .map(toServerNode)
      .filter((child): child is JSONContent => child !== null);
  }
  return result;
};

/** 편집기가 내놓은 문서를 서버가 받는 모양으로 바꾼다 */
export const toServerDoc = (doc: JSONContent): GuideDoc => ({
  type: 'doc',
  content: (doc.content ?? [])
    .map(toServerNode)
    .filter((child): child is JSONContent => child !== null),
});

const withSrc = (
  node: JSONContent,
  srcOf: (key: string) => string | undefined,
): JSONContent => {
  if (node.type === 'guideImage') {
    return {
      ...node,
      attrs: { ...node.attrs, src: srcOf(String(node.attrs?.key)) ?? null },
    };
  }
  return node.content
    ? { ...node, content: node.content.map(child => withSrc(child, srcOf)) }
    : node;
};

/**
 * 서버 문서에 사진 주소를 붙여 편집기 · 보기에 넣을 모양으로 바꾼다. 주소는 조회 응답의
 * `photoUrls`(키별) 나, 아직 올리지 않은 사진이면 기기 쪽 미리보기다.
 */
export const fromServerDoc = (
  doc: JSONContent,
  srcOf: (key: string) => string | undefined,
): JSONContent => withSrc(doc, srcOf);

/** 서버가 세는 대로 센다 — 글 노드의 글자 수 합계와 사진 키 */
export const measureDoc = (doc: JSONContent | undefined) => {
  let chars = 0;
  const imageKeys: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === 'text') {
      chars += node.text?.length ?? 0;
    }
    if (node.type === 'guideImage' && typeof node.attrs?.key === 'string') {
      imageKeys.push(node.attrs.key);
    }
    node.content?.forEach(walk);
  };
  if (doc) {
    walk(doc);
  }
  return { chars, imageKeys };
};

/** 사진 키를 바꾼다 — 올리기 전 임시 키를 올린 뒤 받은 키로 */
export const replaceImageKeys = (
  doc: JSONContent,
  keyOf: (key: string) => string,
): JSONContent => {
  if (doc.type === 'guideImage' && typeof doc.attrs?.key === 'string') {
    return { ...doc, attrs: { ...doc.attrs, key: keyOf(doc.attrs.key) } };
  }
  return doc.content
    ? { ...doc, content: doc.content.map(child => replaceImageKeys(child, keyOf)) }
    : doc;
};
