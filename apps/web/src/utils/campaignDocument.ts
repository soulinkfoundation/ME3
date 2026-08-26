export type CampaignTextMark = "bold" | "italic" | "underline";

export type CampaignTextSpan = {
  text: string;
  marks?: CampaignTextMark[];
  link?: string;
};

export type CampaignTextParagraph = {
  style: "body" | "heading1" | "heading2" | "bullet";
  spans: CampaignTextSpan[];
};

export type CampaignTextBlock = {
  id: string;
  type: "text";
  paragraphs: CampaignTextParagraph[];
};

export type CampaignExtraBlock =
  | {
      id: string;
      type: "image";
      assetId: string;
      src: string;
      alt: string;
      href?: string;
      caption?: string;
    }
  | {
      id: string;
      type: "button";
      label: string;
      href: string;
      alignment: "left" | "center";
    }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; size: "small" | "medium" | "large" };

export type CampaignDocument = {
  version: "me3.campaign-document.v1";
  brand: {
    name: string;
    homeUrl: string;
    logoUrl: string | null;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;
    accentColor: string;
  };
  blocks: Array<CampaignTextBlock | CampaignExtraBlock>;
};

export function campaignDocumentToEditorHtml(document: CampaignDocument): string {
  const text = document.blocks.find(
    (block): block is CampaignTextBlock => block.type === "text",
  );
  if (!text) return "<p></p>";
  const html: string[] = [];
  let inList = false;
  for (const paragraph of text.paragraphs) {
    if (paragraph.style === "bullet" && !inList) {
      html.push("<ul>");
      inList = true;
    } else if (paragraph.style !== "bullet" && inList) {
      html.push("</ul>");
      inList = false;
    }
    const content = paragraph.spans.map(spanToHtml).join("") || "<br>";
    const tag =
      paragraph.style === "heading1"
        ? "h1"
        : paragraph.style === "heading2"
          ? "h2"
          : paragraph.style === "bullet"
            ? "li"
            : "p";
    html.push(`<${tag}>${content}</${tag}>`);
  }
  if (inList) html.push("</ul>");
  return html.join("");
}

export function campaignEditorHtmlToTextBlock(html: string): CampaignTextBlock {
  const parsed = new DOMParser().parseFromString(html || "<p></p>", "text/html");
  const paragraphs: CampaignTextParagraph[] = [];
  for (const element of parsed.body.querySelectorAll(":scope > p, :scope > h1, :scope > h2, :scope > ul > li")) {
    const style =
      element.tagName === "H1"
        ? "heading1"
        : element.tagName === "H2"
          ? "heading2"
          : element.tagName === "LI"
            ? "bullet"
            : "body";
    paragraphs.push({ style, spans: spansFromNode(element) });
  }
  return {
    id: "campaign-copy",
    type: "text",
    paragraphs: paragraphs.length
      ? paragraphs
      : [{ style: "body", spans: [{ text: "" }] }],
  };
}

function spansFromNode(node: Node): CampaignTextSpan[] {
  const spans: CampaignTextSpan[] = [];
  walk(node, [], undefined, spans);
  return spans.length ? mergeAdjacentSpans(spans) : [{ text: "" }];
}

function walk(
  node: Node,
  marks: CampaignTextMark[],
  link: string | undefined,
  spans: CampaignTextSpan[],
) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (text) spans.push({ text, ...(marks.length ? { marks } : {}), ...(link ? { link } : {}) });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === "BR") {
    spans.push({ text: "\n", ...(marks.length ? { marks } : {}), ...(link ? { link } : {}) });
    return;
  }
  const nextMarks = [...marks];
  if (["STRONG", "B"].includes(node.tagName)) nextMarks.push("bold");
  if (["EM", "I"].includes(node.tagName)) nextMarks.push("italic");
  if (node.tagName === "U") nextMarks.push("underline");
  const nextLink = node.tagName === "A" ? node.getAttribute("href") || undefined : link;
  for (const child of node.childNodes) walk(child, [...new Set(nextMarks)], nextLink, spans);
}

function mergeAdjacentSpans(spans: CampaignTextSpan[]): CampaignTextSpan[] {
  const merged: CampaignTextSpan[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.link === span.link &&
      JSON.stringify(previous.marks || []) === JSON.stringify(span.marks || [])
    ) {
      previous.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function spanToHtml(span: CampaignTextSpan): string {
  let content = escapeHtml(span.text).replace(/\n/g, "<br>");
  for (const mark of span.marks || []) {
    if (mark === "bold") content = `<strong>${content}</strong>`;
    if (mark === "italic") content = `<em>${content}</em>`;
    if (mark === "underline") content = `<u>${content}</u>`;
  }
  if (span.link) content = `<a href="${escapeHtml(span.link)}">${content}</a>`;
  return content;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
