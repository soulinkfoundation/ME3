import TurndownService from "turndown";

export function createContentTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
  });

  turndown.keep((node) => {
    if (!(node instanceof HTMLElement)) return false;
    return (
      node.hasAttribute("data-tiptap-image") ||
      node.hasAttribute("data-gallery") ||
      node.hasAttribute("data-tiptap-youtube") ||
      node.hasAttribute("data-tiptap-faq") ||
      node.hasAttribute("data-tiptap-carousel") ||
      node.hasAttribute("data-me3-site-block") ||
      node.hasAttribute("data-me3-cta-button") ||
      node.hasAttribute("data-me3-audio")
    );
  });

  turndown.addRule("tiptapTaskItem", {
    filter(node) {
      return node.nodeType === 1 && node.getAttribute("data-type") === "taskItem";
    },
    replacement(content, node) {
      const input = node.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null;
      const checked =
        node.getAttribute("data-checked") === "true" ||
        input?.checked === true ||
        input?.hasAttribute("checked") === true;
      const itemContent = content
        .trim()
        .replace(/\n{3,}/g, "\n\n")
        .replace(/\n/g, "\n  ");

      return itemContent ? `- [${checked ? "x" : " "}] ${itemContent}\n` : "";
    },
  });

  return turndown;
}
