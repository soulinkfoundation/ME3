import { describe, expect, it } from "vitest";
import {
  campaignDocumentToEditorHtml,
  campaignEditorHtmlToBlocks,
  campaignEditorHtmlToTextBlock,
  type CampaignDocument,
} from "./campaignDocument";

describe("campaign document editor conversion", () => {
  it("preserves the supported rich-text structure", () => {
    const block = campaignEditorHtmlToTextBlock(
      '<h1>Hello</h1><p>A <strong>useful</strong> <a href="https://example.com">update</a>.</p><ul><li>First</li><li><em>Second</em></li></ul>',
    );

    expect(block.paragraphs).toEqual([
      { style: "heading1", spans: [{ text: "Hello" }] },
      {
        style: "body",
        spans: [
          { text: "A " },
          { text: "useful", marks: ["bold"] },
          { text: " " },
          { text: "update", link: "https://example.com" },
          { text: "." },
        ],
      },
      { style: "bullet", spans: [{ text: "First" }] },
      { style: "bullet", spans: [{ text: "Second", marks: ["italic"] }] },
    ]);
  });

  it("escapes stored text and attributes when returning it to the editor", () => {
    const document: CampaignDocument = {
      version: "me3.campaign-document.v1",
      brand: {
        name: "ME3",
        homeUrl: "https://example.com",
        logoUrl: null,
        logoAlignment: "center",
        backgroundColor: "#ffffff",
        surfaceColor: "#ffffff",
        textColor: "#111111",
        accentColor: "#147d64",
      },
      blocks: [
        {
          id: "copy",
          type: "text",
          paragraphs: [
            {
              style: "body",
              spans: [{ text: '<script>alert("no")</script>', link: 'https://example.com/?q="x"' }],
            },
          ],
        },
      ],
    };

    expect(campaignDocumentToEditorHtml(document)).toBe(
      '<p><a href="https://example.com/?q=&quot;x&quot;">&lt;script&gt;alert(&quot;no&quot;)&lt;/script&gt;</a></p>',
    );
  });

  it("round-trips campaign images, dividers, and CTA buttons in editor order", () => {
    const blocks = campaignEditorHtmlToBlocks(
      '<p>Opening</p><hr><img src="https://example.com/photo.jpg" alt="A view" data-image-id="asset-1"><div data-me3-cta-button="true" data-text="Read more" data-url="https://example.com/read"></div><p>Closing</p>',
    );

    expect(blocks).toEqual([
      {
        id: "campaign-copy-1",
        type: "text",
        paragraphs: [{ style: "body", spans: [{ text: "Opening" }] }],
      },
      { id: "campaign-divider-2", type: "divider" },
      {
        id: "campaign-image-3",
        type: "image",
        assetId: "asset-1",
        src: "https://example.com/photo.jpg",
        alt: "A view",
      },
      {
        id: "campaign-button-4",
        type: "button",
        label: "Read more",
        href: "https://example.com/read",
        alignment: "center",
      },
      {
        id: "campaign-copy-5",
        type: "text",
        paragraphs: [{ style: "body", spans: [{ text: "Closing" }] }],
      },
    ]);
  });

  it("does not save an unfinished CTA button", () => {
    expect(
      campaignEditorHtmlToBlocks(
        '<p>Hello</p><div data-me3-cta-button="true" data-text="Learn more" data-url=""></div>',
      ),
    ).toEqual([
      {
        id: "campaign-copy-1",
        type: "text",
        paragraphs: [{ style: "body", spans: [{ text: "Hello" }] }],
      },
    ]);
  });
});
