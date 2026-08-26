export type JournalBodyFormat = "plain_text" | "markdown" | "html";

export function journalBodyForEditor(
  body: string,
  bodyFormat: JournalBodyFormat,
): string {
  if (!body) return "";
  if (bodyFormat === "html") return body;
  if (bodyFormat === "plain_text") return plainTextToHtml(body);
  return journalMarkdownToHtml(body);
}

function plainTextToHtml(value: string): string {
  return normalizedLines(value)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
}

function journalMarkdownToHtml(value: string): string {
  const html: string[] = [];
  let list: JournalList | null = null;

  const flushList = () => {
    if (!list) return;
    if (list.kind === "task") {
      html.push(
        `<ul data-type="taskList" class="tiptap-task-list">${list.items
          .map(
            (item) =>
              `<li data-type="taskItem" data-checked="${item.checked ? "true" : "false"}"><label><input type="checkbox"${item.checked ? " checked" : ""}><span></span></label><div><p>${renderInlineMarkdown(item.text)}</p></div></li>`,
          )
          .join("")}</ul>`,
      );
    } else {
      const tag = list.kind === "ordered" ? "ol" : "ul";
      html.push(
        `<${tag}>${list.items
          .map((item) => `<li><p>${renderInlineMarkdown(item.text)}</p></li>`)
          .join("")}</${tag}>`,
      );
    }
    list = null;
  };

  for (const line of normalizedLines(value)) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const task = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (task) {
      if (list?.kind !== "task") {
        flushList();
        list = { kind: "task", items: [] };
      }
      list.items.push({ text: task[2], checked: task[1].toLowerCase() === "x" });
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      if (list?.kind !== "bullet") {
        flushList();
        list = { kind: "bullet", items: [] };
      }
      list.items.push({ text: bullet[1], checked: false });
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (list?.kind !== "ordered") {
        flushList();
        list = { kind: "ordered", items: [] };
      }
      list.items.push({ text: ordered[1], checked: false });
      continue;
    }

    flushList();
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      html.push('<hr class="tiptap-divider">');
      continue;
    }
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      html.push(`<blockquote><p>${renderInlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();
  return html.join("");
}

type JournalList = {
  kind: "task" | "bullet" | "ordered";
  items: Array<{ text: string; checked: boolean }>;
};

function normalizedLines(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

function renderInlineMarkdown(value: string): string {
  const protectedHtml: string[] = [];
  const protect = (html: string) => {
    const token = `\u0000ME3INLINE${protectedHtml.length}\u0000`;
    protectedHtml.push(html);
    return token;
  };

  let source = value
    .replace(/`([^`\n]+)`/g, (_match, code: string) => protect(`<code>${escapeHtml(code)}</code>`))
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+|#[^)\s]+)\)/gi,
      (_match, label: string, href: string) =>
        protect(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`),
    )
    .replace(/<u>([^\n]+?)<\/u>/gi, (_match, text: string) => protect(`<u>${escapeHtml(text)}</u>`));

  source = escapeHtml(source)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<s>$1</s>")
    .replace(/(?<!\*)\*(?!\*)(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, "<em>$1</em>");

  return source.replace(/\u0000ME3INLINE(\d+)\u0000/g, (_match, index: string) => {
    return protectedHtml[Number(index)] || "";
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
