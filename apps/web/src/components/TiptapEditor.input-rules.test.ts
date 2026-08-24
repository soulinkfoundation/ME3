import { Editor } from "@tiptap/core";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

const editors: Editor[] = [];
const editorElements = new Map<Editor, HTMLElement>();

function createEditor(): Editor {
  const element = document.createElement("div");
  document.body.append(element);

  const editor = new Editor({
    element,
    content: "",
    extensions: [
      StarterKit.configure({ horizontalRule: false }),
      HorizontalRule.configure({
        HTMLAttributes: {
          class: "tiptap-divider",
        },
      }),
    ],
  });
  editors.push(editor);
  editorElements.set(editor, element);
  return editor;
}

function typeText(editor: Editor, text: string): void {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to),
      ),
    );

    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(character, from, to));
    }
  }
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    const element = editorElements.get(editor);
    editor.destroy();
    element?.remove();
    editorElements.delete(editor);
  }
});

describe("Tiptap divider input rule", () => {
  it("converts three typed dashes into a horizontal divider", () => {
    const editor = createEditor();

    typeText(editor, "---");

    expect(editor.getHTML()).toBe('<hr class="tiptap-divider"><p></p>');
  });
});
