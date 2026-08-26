import { describe, expect, it } from "vitest";
import { journalBodyForEditor } from "./journalContent";

describe("journalBodyForEditor", () => {
  it("leaves existing HTML unchanged", () => {
    const html = "<p>Already rich</p>";
    expect(journalBodyForEditor(html, "html")).toBe(html);
  });

  it("preserves iOS Markdown paragraphs and lists in Tiptap HTML", () => {
    const markdown = [
      "Initiator",
      "",
      "1. Book time with Sarah next week.",
      "2. Confirm three options.",
      "",
      "- First bullet",
      "- Second bullet",
    ].join("\n");

    expect(journalBodyForEditor(markdown, "markdown")).toBe(
      "<p>Initiator</p>" +
        "<ol><li><p>Book time with Sarah next week.</p></li><li><p>Confirm three options.</p></li></ol>" +
        "<ul><li><p>First bullet</p></li><li><p>Second bullet</p></li></ul>",
    );
  });

  it("turns iOS checkboxes into Tiptap task items", () => {
    expect(
      journalBodyForEditor("- [ ] Open task\n- [x] Finished task", "markdown"),
    ).toBe(
      '<ul data-type="taskList" class="tiptap-task-list">' +
        '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Open task</p></div></li>' +
        '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Finished task</p></div></li>' +
        "</ul>",
    );
  });

  it("preserves supported inline formatting and escapes raw HTML", () => {
    expect(
      journalBodyForEditor(
        "**Bold** *italic* ~~strike~~ <u>under</u> `code` <script>alert(1)</script>",
        "markdown",
      ),
    ).toBe(
      "<p><strong>Bold</strong> <em>italic</em> <s>strike</s> <u>under</u> <code>code</code> &lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  it("preserves every plain-text line", () => {
    expect(journalBodyForEditor("First\nSecond", "plain_text")).toBe(
      "<p>First</p><p>Second</p>",
    );
  });
});
