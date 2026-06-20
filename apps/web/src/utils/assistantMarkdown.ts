type ListKind = "ol" | "ul";

const SAFE_HREF_PATTERN =
  /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|[A-Za-z0-9._~!$&'()*+,;=@%-]+(?:\/|$))/i;

export function renderAssistantMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraphLines: string[] = [];
  let listKind: ListKind | null = null;
  let listItems: string[] = [];
  let blockquoteLines: string[] = [];

  function flushParagraph() {
    if (!paragraphLines.length) return;
    html.push(
      `<p>${renderInlineMarkdown(paragraphLines.join("\n")).replace(/\n/g, "<br>")}</p>`,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (!listKind || !listItems.length) return;
    html.push(
      `<${listKind}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listKind}>`,
    );
    listKind = null;
    listItems = [];
  }

  function flushBlockquote() {
    if (!blockquoteLines.length) return;
    html.push(
      `<blockquote>${renderAssistantMarkdown(blockquoteLines.join("\n"))}</blockquote>`,
    );
    blockquoteLines = [];
  }

  function flushBlocks() {
    flushParagraph();
    flushList();
    flushBlockquote();
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushBlocks();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (!trimmed) {
      flushBlocks();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      html.push(
        `<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`,
      );
      continue;
    }

    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushBlocks();
      html.push("<hr>");
      continue;
    }

    const unorderedItem = trimmed.match(/^[-*+]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      flushBlockquote();
      if (listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(unorderedItem[1]);
      continue;
    }

    const orderedItem = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      flushBlockquote();
      if (listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(orderedItem[1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blockquoteLines.push(quote[1]);
      continue;
    }

    flushList();
    flushBlockquote();
    paragraphLines.push(line);
  }

  flushBlocks();
  return html.join("");
}

function renderInlineMarkdown(text: string): string {
  const parts = text.split(/(`[^`\n]+`)/g);
  return parts
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return renderInlineLinks(part);
    })
    .join("");
}

function renderInlineLinks(text: string): string {
  const pieces: string[] = [];
  const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(text))) {
    pieces.push(renderInlineMarks(text.slice(lastIndex, match.index)));
    const href = sanitizeHref(match[2]);
    if (href) {
      pieces.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarks(match[1])}</a>`,
      );
    } else {
      pieces.push(renderInlineMarks(match[0]));
    }
    lastIndex = match.index + match[0].length;
  }

  pieces.push(renderInlineMarks(text.slice(lastIndex)));
  return pieces.join("");
}

function renderInlineMarks(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n][\s\S]*?[^_\n])__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n][\s\S]*?[^~\n])~~/g, "<del>$1</del>")
    .replace(/\*([^*\n][^*\n]*?[^*\n])\*/g, "<em>$1</em>")
    .replace(/_([^_\n][^_\n]*?[^_\n])_/g, "<em>$1</em>");
}

function sanitizeHref(value: string): string | null {
  const href = value.trim();
  const explicitProtocol = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (
    explicitProtocol &&
    !["http:", "https:", "mailto:", "tel:"].includes(
      explicitProtocol[0].toLowerCase(),
    )
  ) {
    return null;
  }
  if (!href || !SAFE_HREF_PATTERN.test(href)) return null;
  return href;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
