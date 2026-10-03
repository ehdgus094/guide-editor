/**
 * 가이드 문서의 모양. **값은 쓰는 쪽의 디자인 토큰에서 온다** — 이 패키지는 토큰 파일을 모르므로
 * 색 · 크기를 받아 CSS 를 만든다. 쓰는 곳들이 같은 함수를 부르면 같은 모양이 된다.
 */
export interface GuideTheme {
  colors: {
    ink: string;
    inkMuted: string;
    border: string;
    brand: string;
    /** 형광펜 */
    highlight: string;
    /** 주의 상자 바탕 · 줄 · "주의" 글자 */
    calloutSurface: string;
    calloutAccent: string;
  };
  /** px. 제목 1 · 제목 2 · 본문 · 작은 제목 · 캡션 */
  fontSize: {
    title: number;
    heading: number;
    body: number;
    label: number;
    caption: number;
  };
  /** px. 사진 모서리 */
  imageRadius: number;
  fontFamily?: string;
}

/**
 * 제목 단계는 타입 단에 옮긴다 — 제목 1 은 화면 제목, 제목 2 는 카드 제목, 제목 3 은 굵은 본문,
 * 제목 4 · 5 는 굵은 라벨, 제목 6 은 굵은 캡션이다.
 */
export const guideDocumentCss = ({
  colors,
  fontSize,
  imageRadius,
  fontFamily,
}: GuideTheme) => `
  .ProseMirror {
    color: ${colors.ink};
    font-size: ${fontSize.body}px;
    line-height: 1.47;
    ${fontFamily ? `font-family: ${fontFamily};` : ''}
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .ProseMirror p { margin: 0 0 8px; }
  .ProseMirror h1, .ProseMirror h2, .ProseMirror h3,
  .ProseMirror h4, .ProseMirror h5, .ProseMirror h6 { margin: 16px 0 8px; line-height: 1.36; }
  .ProseMirror h1 { font-size: ${fontSize.title}px; font-weight: 800; }
  .ProseMirror h2 { font-size: ${fontSize.heading}px; font-weight: 700; }
  .ProseMirror h3 { font-size: ${fontSize.body}px; font-weight: 700; }
  .ProseMirror h4, .ProseMirror h5 { font-size: ${fontSize.label}px; font-weight: 700; }
  .ProseMirror h6 { font-size: ${fontSize.caption}px; font-weight: 700; }
  .ProseMirror > :first-child { margin-top: 0; }
  .ProseMirror ul, .ProseMirror ol { margin: 0 0 8px; padding-left: 20px; }
  .ProseMirror li p { margin: 0 0 4px; }
  .ProseMirror mark { background-color: ${colors.highlight}; color: inherit; }
  .ProseMirror blockquote {
    margin: 8px 0; padding: 4px 12px; border-left: 3px solid ${colors.border}; color: ${colors.inkMuted};
  }
  div[data-callout] {
    margin: 8px 0; padding: 8px 12px;
    background: ${colors.calloutSurface}; border-left: 3px solid ${colors.calloutAccent};
  }
  div[data-callout]::before {
    content: '주의'; display: block; font-weight: 700;
    font-size: ${fontSize.caption}px; color: ${colors.calloutAccent};
  }
  div[data-callout] p { margin: 4px 0; }
  figure[data-guide-image] { margin: 12px 0; }
  figure[data-guide-image] img {
    display: block; width: 100%; height: auto; margin: 0 auto; border-radius: ${imageRadius}px;
    -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
  }
  figure[data-size="twoThirds"] img { width: 66.6667%; }
  figure[data-size="oneThird"] img { width: 33.3333%; }
  figure[data-align="left"] img { margin-left: 0; }
  figure[data-align="right"] img { margin-right: 0; }
  figure.ProseMirror-selectednode img { outline: 3px solid ${colors.brand}; }
`;
