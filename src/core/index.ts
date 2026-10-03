/**
 * 가이드 문서의 정본 — 스키마 · 확장 · 문서 CSS · 서버 모양 변환. 웹(Tiptap)과 앱(10tap WebView)이
 * 모두 이것을 쓴다. 10tap 에 기대지 않는다.
 */
export {
  ALIGNS,
  GUIDE_CONTENT,
  GUIDE_HIGHLIGHT,
  GUIDE_LIMITS,
  GuideCallout,
  GuideImage,
  GuideListDepth,
  GuideTextAlign,
  IMAGE_SIZES,
  deepestList,
  oneOf,
} from './schema';
export type { Align, ImageSize } from './schema';
export {
  EMPTY_GUIDE_DOC,
  fromServerDoc,
  measureDoc,
  replaceImageKeys,
  toServerDoc,
} from './serverDoc';
export type { GuideDoc } from './serverDoc';
export { guideDocumentCss } from './style';
export type { GuideTheme } from './style';
