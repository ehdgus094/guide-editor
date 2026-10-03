import { Extension } from '@tiptap/core';
import { TrailingNode } from '@tiptap/extensions';
import {
  AllSelection,
  NodeSelection,
  Plugin,
  TextSelection,
} from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import {
  BlockquoteBridge,
  BoldBridge,
  BridgeExtension,
  BulletListBridge,
  CoreBridge,
  HardBreakBridge,
  HeadingBridge,
  HighlightBridge,
  HistoryBridge,
  ItalicBridge,
  ListItemBridge,
  OrderedListBridge,
  PlaceholderBridge,
  StrikeBridge,
  UnderlineBridge,
} from '@10play/tentap-editor';

import {
  ALIGNS,
  GUIDE_CONTENT,
  GUIDE_HIGHLIGHT,
  GuideCallout,
  GuideImage,
  GuideListDepth,
  GuideTextAlign,
  IMAGE_SIZES,
  oneOf,
} from '../core/schema';
import type { Align, ImageSize } from '../core/schema';

/**
 * 앱 WebView 안의 편집기와 앱을 잇는 10tap 연결. **앱과 WebView 안 편집기가 이 파일을 함께 읽는다** —
 * 앱은 보낼 명령과 받을 상태를, WebView 쪽은 명령을 받아 문서를 바꾸는 쪽을 쓴다. 두 쪽은 브리지
 * 이름으로 짝을 맞춘다.
 *
 * 앱에는 DOM 타입이 없으므로 WebView 안에서만 부르는 DOM 함수는 좁게 적는다.
 */
type BlurrableElement = { blur: () => void };
type DomEvent = { preventDefault: () => void };

/** 10tap 이 WebView 에 주입하는 값 — `'ios'` · `'android'` */
type TenTapWindow = { platform?: string };

export type GuideFormat =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'highlight'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'callout';

enum GuideActionType {
  InsertImage = 'guide-insert-image',
  MoveBlock = 'guide-move-block',
  SetImageSize = 'guide-set-image-size',
  DeleteImage = 'guide-delete-image',
  SetAlign = 'guide-set-align',
  Format = 'guide-format',
}

type GuideMessage =
  | { type: GuideActionType.InsertImage; payload: { key: string; src: string } }
  | { type: GuideActionType.MoveBlock; payload: 'up' | 'down' }
  | { type: GuideActionType.SetImageSize; payload: ImageSize }
  | { type: GuideActionType.DeleteImage; payload?: undefined }
  | { type: GuideActionType.SetAlign; payload: Align }
  | { type: GuideActionType.Format; payload: GuideFormat };

type GuideEditorState = {
  canMoveBlockUp: boolean;
  canMoveBlockDown: boolean;
  /** 고른 사진. 없으면 `null` */
  selectedImage: { size: ImageSize; align: Align } | null;
  /** 커서가 있는 문단 · 제목의 정렬. 그 밖이면 `null` */
  textAlign: Align | null;
  /** 형광펜은 한 가지 색이라 켜졌는지만 본다 — 10tap 상태는 색을 준다 */
  isHighlightActive: boolean;
  isCalloutActive: boolean;
  /** 커서가 있는 목록의 단수. 목록 밖이면 0 */
  listDepth: number;
};

type GuideEditorInstance = {
  insertGuideImage: (image: { key: string; src: string }) => void;
  /** 고른 사진이나 커서가 있는 블록을 앞 · 뒤 블록과 자리를 바꾼다 */
  moveBlock: (direction: 'up' | 'down') => void;
  setImageSize: (size: ImageSize) => void;
  /**
   * 고른 사진을 지운다. 사진 아래 줄에서 백스페이스를 누르면 편집기는 사진을 고르기만 하는데, 사진을
   * 고르면 키보드가 내려가 두 번째 백스페이스를 칠 수 없다.
   */
  deleteImage: () => void;
  /** 사진을 골랐으면 그 사진을, 아니면 고른 범위의 문단 · 제목을 정렬한다 */
  setAlign: (align: Align) => void;
  /** 한글 조합을 끝낸 뒤 서식을 바꾼다 */
  formatAfterCommit: (format: GuideFormat) => void;
};

declare module '@10play/tentap-editor' {
  interface BridgeState extends GuideEditorState {}
  interface EditorBridge extends GuideEditorInstance {}
}

/** 다시 잡기 전에 기다리는 시간. 같은 순간에 다시 잡으면 키보드에 닿지 않는다 */
const REFOCUS_DELAY_MS = 80;

/** 한글 자모 · 완성형 글자 */
const HANGUL = /[ㄱ-ㆎ가-힣]/;

type TargetElement = { closest?: (selector: string) => unknown };

const isImageSelection = (selection: unknown) =>
  selection instanceof NodeSelection &&
  selection.node.type.name === GuideImage.name;

type InputModeElement = {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

/**
 * 사진이 골라진 동안 키보드를 숨긴다. **포커스는 놓지 않는다** — iOS WebKit 은 사진이 골라진 채
 * 포커스를 놓으면 곧바로 되돌리면서 편집기가 브라우저 쪽 커서를 다시 읽어, 선택이 사진 앞 글이나 문서
 * 맨 앞으로 튄다. 키보드 종류를 '없음' 으로 바꾸면 포커스를 둔 채 키보드만 내려간다. 글로 돌아가면
 * 되돌려 키보드가 다시 올라온다.
 */
const syncKeyboard = (dom: unknown, selection: unknown) => {
  const element = dom as InputModeElement;
  if (isImageSelection(selection)) {
    element.setAttribute('inputmode', 'none');
  } else {
    element.removeAttribute('inputmode');
  }
};

/**
 * 손가락으로 다루는 편집기의 동작. 사진을 고르면 키보드를 숨기고, 끌어서 옮기지 못하게 한다 —
 * 옮기는 것은 [위로] · [아래로] 다.
 */
const GuideTouch = Extension.create({
  name: 'guideTouch',
  onSelectionUpdate() {
    syncKeyboard(this.editor.view.dom, this.editor.state.selection);
  },
  addProseMirrorPlugins() {
    const block = (_view: unknown, event: unknown) => {
      (event as DomEvent).preventDefault();
      return true;
    };
    return [
      new Plugin({
        // 블록이 하나도 없는 문서(`content: []`)로 만들어지면 커서를 둘 곳이 없어 편집기가 문서 전체를
        // 고른 채 선다. 그 상태로는 줄바꿈이 새 줄을 만들지 못하고 사진을 넣을 자리도 없다. 화면이
        // 서자마자 빈 문단을 하나 두고 커서를 그 안에 놓는다.
        view: editorView => {
          const { state } = editorView;
          if (
            state.doc.childCount === 0 ||
            state.selection instanceof AllSelection
          ) {
            const tr = state.tr;
            if (state.doc.childCount === 0) {
              tr.insert(0, state.schema.nodes.paragraph.create());
            }
            editorView.dispatch(
              tr
                .setSelection(TextSelection.atStart(tr.doc))
                .setMeta('addToHistory', false),
            );
          }
          return {};
        },
        props: {
          handleDOMEvents: {
            dragstart: block,
            drop: block,
            // 사진을 누르면 그 누르기의 기본 처리(편집기에 포커스 주기)를 막고 사진을 직접 고른다.
            // 키보드가 내려가 있던 때 눌러도 올라오지 않는다.
            mousedown: (view, event) => {
              const target = (event as unknown as { target: TargetElement })
                .target;
              const figure = target.closest?.('figure[data-guide-image]');
              if (!figure) {
                return false;
              }
              let position: number | null = null;
              view.state.doc.forEach((node, offset) => {
                if (
                  node.type.name === GuideImage.name &&
                  view.nodeDOM(offset) === (figure as unknown)
                ) {
                  position = offset;
                }
              });
              if (position === null) {
                return false;
              }
              (event as unknown as DomEvent).preventDefault();
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, position),
                ),
              );
              return true;
            },
          },
        },
      }),
    ];
  },
});

/**
 * 위 · 아래로 옮길 블록. 사진을 골랐으면 그 사진, 아니면 커서가 있는 블록이다 — 목록 안이면 그
 * 항목을 같은 목록 안에서, 밖이면 맨 바깥 블록을 옮긴다.
 */
const movableBlock = (selection: unknown) => {
  if (selection instanceof NodeSelection) {
    const { $from } = selection;
    return {
      node: selection.node,
      position: selection.from,
      parent: $from.parent,
      index: $from.index(),
    };
  }
  if (!(selection instanceof TextSelection)) {
    return null;
  }
  const { $from } = selection;
  let depth = 1;
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === 'listItem') {
      depth = d;
      break;
    }
  }
  if ($from.depth < depth) {
    return null;
  }
  return {
    node: $from.node(depth),
    position: $from.before(depth),
    parent: $from.node(depth - 1),
    index: $from.index(depth - 1),
  };
};

/**
 * 자리를 바꿀 앞 · 뒤 블록. 문서 끝의 빈 줄과는 바꾸지 않는다 — 그 줄은 TrailingNode 가 두는
 * 것이라, 바꾸면 그 뒤에 빈 줄이 또 생겨 끝없이 내려간다.
 */
const movableNeighbor = (
  block: NonNullable<ReturnType<typeof movableBlock>>,
  up: boolean,
) => {
  const { parent, index } = block;
  const neighbor = parent.maybeChild(up ? index - 1 : index + 1);
  if (!neighbor) {
    return null;
  }
  const trailing =
    !up &&
    parent.type.name === 'doc' &&
    index + 1 === parent.childCount - 1 &&
    neighbor.type.name === 'paragraph' &&
    neighbor.content.size === 0;
  return trailing ? null : neighbor;
};

/** 커서가 있는 목록의 단수 */
const listDepthAt = (state: EditorState) => {
  const { $from } = state.selection;
  let depth = 0;
  for (let d = $from.depth; d > 0; d -= 1) {
    const name = $from.node(d).type.name;
    if (name === 'bulletList' || name === 'orderedList') {
      depth += 1;
    }
  }
  return depth;
};

export const GuideBridge = new BridgeExtension<
  GuideEditorState,
  GuideEditorInstance,
  GuideMessage
>({
  tiptapExtension: GuideImage,
  // 마지막 블록이 사진이어도 그 뒤에 쓸 줄이 늘 있다.
  tiptapExtensionDeps: [
    TrailingNode.configure({ node: 'paragraph' }),
    GuideTextAlign,
    GuideCallout,
    GuideListDepth,
    GuideTouch,
  ],
  onBridgeMessage: (editor, message) => {
    if (message.type === GuideActionType.InsertImage) {
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const { selection } = tr;
          const { $from } = selection;
          // 사진은 지금 줄을 덮지 않고 그 줄 옆에 선다. 빈 줄이면 그 앞에 넣어 빈 줄을 아래로
          // 밀고, 글이 있는 줄이면 그 뒤에 넣는다. 목록 안에서도 맨 바깥 블록을 기준으로 삼는다.
          let position: number;
          if (selection instanceof NodeSelection && $from.depth === 0) {
            position = selection.to;
          } else {
            const block = $from.node(1);
            position =
              block.isTextblock && block.content.size === 0
                ? $from.before(1)
                : $from.after(1);
          }
          const image = state.schema.nodes.guideImage.create(message.payload);
          tr.insert(position, image);
          const after = position + image.nodeSize;
          const next = tr.doc.nodeAt(after);
          if (!next || next.type.name !== 'paragraph') {
            tr.insert(after, state.schema.nodes.paragraph.create());
          }
          // 이어 쓰거나 다음 사진을 넣을 자리는 사진 바로 아래 줄이다.
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          return true;
        })
        .run();
    }
    if (message.type === GuideActionType.MoveBlock) {
      const { selection } = editor.state;
      editor
        .chain()
        .command(({ tr }) => {
          const block = movableBlock(tr.selection);
          if (!block) {
            return false;
          }
          const { node, position } = block;
          const up = message.payload === 'up';
          const neighbor = movableNeighbor(block, up);
          if (!neighbor) {
            return false;
          }
          tr.delete(position, position + node.nodeSize);
          const target = up
            ? position - neighbor.nodeSize
            : position + neighbor.nodeSize;
          tr.insert(target, node);
          // 옮긴 블록 안의 같은 자리를 다시 고른다.
          tr.setSelection(
            selection instanceof NodeSelection
              ? NodeSelection.create(tr.doc, target)
              : TextSelection.create(
                  tr.doc,
                  target + (selection.from - position),
                  target + (selection.to - position),
                ),
          );
          tr.scrollIntoView();
          return true;
        })
        .run();
      // 글을 옮길 때는 쓰던 그대로 이어 쓴다. 사진을 고른 동안은 키보드를 내려 둔다.
      if (!(selection instanceof NodeSelection)) {
        editor.commands.focus();
      }
    }
    // 사진을 고른 동안은 포커스를 잡지 않는다 — 키보드는 내려가 있다.
    if (message.type === GuideActionType.SetImageSize) {
      editor
        .chain()
        .command(({ tr }) => {
          const { selection } = tr;
          if (!isImageSelection(selection)) {
            return false;
          }
          const node = (selection as NodeSelection).node;
          tr.setNodeMarkup(selection.from, undefined, {
            ...node.attrs,
            size: message.payload,
          });
          return true;
        })
        .run();
    }
    // 지운 자리 아래 줄에서 이어 쓴다.
    if (message.type === GuideActionType.DeleteImage) {
      editor
        .chain()
        .command(({ tr }) => {
          const { selection } = tr;
          if (!isImageSelection(selection)) {
            return false;
          }
          const position = selection.from;
          tr.delete(position, selection.to);
          tr.setSelection(
            TextSelection.near(
              tr.doc.resolve(Math.min(position, tr.doc.content.size)),
            ),
          );
          return true;
        })
        .focus()
        .run();
    }
    if (message.type === GuideActionType.SetAlign) {
      const { selection } = editor.state;
      const image = isImageSelection(selection);
      editor
        .chain()
        .command(({ tr }) => {
          if (image) {
            tr.setNodeMarkup(selection.from, undefined, {
              ...(selection as NodeSelection).node.attrs,
              align: message.payload,
            });
            return true;
          }
          tr.doc.nodesBetween(selection.from, selection.to, (node, position) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              tr.setNodeMarkup(position, undefined, {
                ...node.attrs,
                textAlign: message.payload,
              });
            }
          });
          return true;
        })
        .run();
      if (!image) {
        editor.commands.focus();
      }
    }
    if (message.type === GuideActionType.Format) {
      const format = message.payload;
      const apply = () => {
        const chain = editor.chain().focus();
        if (
          format === 'bold' ||
          format === 'italic' ||
          format === 'underline' ||
          format === 'strike' ||
          format === 'highlight'
        ) {
          chain.toggleMark(format);
        } else if (format.startsWith('heading')) {
          const level = Number(format.slice('heading'.length));
          chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 });
        } else if (format === 'bulletList') {
          chain.toggleList('bulletList', 'listItem');
        } else if (format === 'orderedList') {
          chain.toggleList('orderedList', 'listItem');
        } else if (format === 'blockquote') {
          chain.toggleWrap('blockquote');
        } else {
          chain.toggleWrap('guideCallout');
        }
        chain.run();
      };
      // 서식 버튼을 누를 때 키보드의 한글 조합을 끝낸다. 끝내지 않으면 다음 자음이 앞 글자의 받침으로
      // 붙어 앞 글자의 서식을 따른다. iOS 한글 키보드는 조합 중이라는 신호를 WebView 에 보내지 않고
      // 입력 대상이 실제로 바뀔 때만 조합을 놓으므로, 커서 바로 앞이 한글이면 포커스를 놓았다가 잠깐 뒤에
      // 다시 잡는다(키보드가 한 번 깜빡인다). 그 밖에는 편집기가 조합 중이라고 알 때만 바로 다시 잡는다.
      const { selection } = editor.state;
      const { $from } = selection;
      const before = selection.empty
        ? $from.parent.textBetween(
            Math.max(0, $from.parentOffset - 1),
            $from.parentOffset,
          )
        : '';
      const ios = (globalThis as unknown as TenTapWindow).platform === 'ios';
      const dom = editor.view.dom as unknown as BlurrableElement;
      if (ios && HANGUL.test(before)) {
        dom.blur();
        setTimeout(apply, REFOCUS_DELAY_MS);
      } else {
        if (editor.view.composing) {
          dom.blur();
          editor.view.focus();
        }
        apply();
      }
    }
    return false;
  },
  extendEditorInstance: sendBridgeMessage => ({
    insertGuideImage: image =>
      sendBridgeMessage({ type: GuideActionType.InsertImage, payload: image }),
    moveBlock: direction =>
      sendBridgeMessage({ type: GuideActionType.MoveBlock, payload: direction }),
    setImageSize: size =>
      sendBridgeMessage({ type: GuideActionType.SetImageSize, payload: size }),
    deleteImage: () => sendBridgeMessage({ type: GuideActionType.DeleteImage }),
    setAlign: align =>
      sendBridgeMessage({ type: GuideActionType.SetAlign, payload: align }),
    formatAfterCommit: format =>
      sendBridgeMessage({ type: GuideActionType.Format, payload: format }),
  }),
  extendEditorState: editor => {
    const { selection } = editor.state;
    const block = movableBlock(selection);
    const image = isImageSelection(selection)
      ? (selection as NodeSelection).node
      : null;
    const textblock = selection.$from.parent;
    return {
      selectedImage: image
        ? {
            size: oneOf(IMAGE_SIZES, image.attrs.size, 'full'),
            align: oneOf(ALIGNS, image.attrs.align, 'center'),
          }
        : null,
      textAlign:
        !image &&
        (textblock.type.name === 'paragraph' ||
          textblock.type.name === 'heading')
          ? oneOf(ALIGNS, textblock.attrs.textAlign, 'left')
          : null,
      isHighlightActive: editor.isActive('highlight'),
      isCalloutActive: editor.isActive('guideCallout'),
      listDepth: listDepthAt(editor.state),
      canMoveBlockUp: block !== null && movableNeighbor(block, true) !== null,
      canMoveBlockDown: block !== null && movableNeighbor(block, false) !== null,
    };
  },
});

/**
 * 가이드 편집기의 브리지. 서식은 굵게 · 기울임 · 밑줄 · 취소선 · 형광펜(한 가지 색) · 제목 · 목록 ·
 * 인용 · 주의 상자다. 여기 없는 서식(링크 · 색 · 코드 · 체크리스트 …)은 붙여 넣을 때 떨어진다 — 링크는
 * 글자만 남는다.
 *
 * **앱과 WebView 가 같은 목록을 쓴다.** 앱은 여기에 문구(플레이스홀더)와 문서 CSS 를 입혀
 * `useEditorBridge` 에 넘긴다 — 설정은 JSON 으로 WebView 에 건너간다.
 */
/**
 * 브리지가 자기 의존으로 끌고 오는 확장을 뗀다.
 *
 * - 목록 브리지는 목록 항목을 한 벌씩 더 들고 온다. 그대로 두면 `listItem` 이 셋이 되고 좁혀 둔
 *   항목(`GUIDE_CONTENT.listItem`)이 아닌 것이 스키마에 설 수 있다. 목록 항목은 `ListItemBridge`
 *   하나만 둔다
 * - 형광펜 브리지는 글자 스타일(`textStyle`)을 들고 온다. 그대로 두면 붙여 넣은 색 글자가 그 마크로
 *   들어오고 서버가 거절한다
 */
const withoutDeps = <S, I, M>(bridge: BridgeExtension<S, I, M>) => {
  const copy = bridge.clone();
  copy.tiptapExtensionDeps = [];
  return copy;
};

export const GUIDE_BRIDGES = [
  CoreBridge,
  HistoryBridge,
  HardBreakBridge,
  BoldBridge,
  ItalicBridge,
  UnderlineBridge,
  StrikeBridge,
  HeadingBridge,
  withoutDeps(BulletListBridge),
  withoutDeps(OrderedListBridge),
  ListItemBridge.extendExtension(GUIDE_CONTENT.listItem),
  BlockquoteBridge.extendExtension(GUIDE_CONTENT.blockquote),
  withoutDeps(HighlightBridge.configureExtension(GUIDE_HIGHLIGHT)),
  PlaceholderBridge,
  GuideBridge,
];

export type { Align, ImageSize };
