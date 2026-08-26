import { describe, expect, it } from "vitest";
import {
  campaignDocumentToEditorHtml,
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
});
