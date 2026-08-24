import { describe, expect, it } from "vitest";
import { createContentTurndownService } from "./contentMarkdown";

describe("createContentTurndownService", () => {
  it("preserves image figures so captions stay attached", () => {
    const markdown = createContentTurndownService().turndown(`
      <figure data-tiptap-image="true" class="tiptap-image-figure">
        <img src="./files/painting.jpg" alt="Painting">
        <figcaption class="tiptap-figcaption">Number 37. Size: 80cm x 90cm.</figcaption>
      </figure>
    `);

    expect(markdown).toContain("<figure");
    expect(markdown).toContain('data-tiptap-image="true"');
    expect(markdown).toContain("<figcaption");
    expect(markdown).toContain("Number 37. Size: 80cm x 90cm.");
  });

  it("preserves gallery containers and their image captions", () => {
    const markdown = createContentTurndownService().turndown(`
      <div data-gallery="true" class="tiptap-gallery">
        <figure data-tiptap-image="true">
          <img src="./files/painting.jpg" alt="Painting">
          <figcaption>Painting caption</figcaption>
        </figure>
      </div>
    `);

    expect(markdown).toContain('data-gallery="true"');
    expect(markdown).toContain("<figcaption>Painting caption</figcaption>");
  });

  it("keeps task items as task-list Markdown", () => {
    const markdown = createContentTurndownService().turndown(`
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Finished</p></div></li>
        <li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Pending</p></div></li>
      </ul>
    `);

    expect(markdown).toContain("- [x] Finished");
    expect(markdown).toContain("- [ ] Pending");
  });

  it("preserves reusable site and call-to-action block markers", () => {
    const markdown = createContentTurndownService().turndown(`
      <div data-me3-site-block="newsletter">​</div>
      <div data-me3-site-block="testimonials">​</div>
      <div data-me3-cta-button="true" data-text="Book now" data-url="/book" data-style="primary">​</div>
    `);

    expect(markdown).toContain('data-me3-site-block="newsletter"');
    expect(markdown).toContain('data-me3-site-block="testimonials"');
    expect(markdown).toContain('data-me3-cta-button="true"');
    expect(markdown).toContain('data-url="/book"');
  });

  it("preserves semantic audio blocks", () => {
    const markdown = createContentTurndownService().turndown(`
      <figure data-me3-audio="true" data-asset-id="audio-id" class="content-audio">
        <figcaption>Grounding practice</figcaption>
        <audio controls preload="metadata">
          <source src="./files/content/audio-id.mp3" type="audio/mpeg">
        </audio>
      </figure>
    `);

    expect(markdown).toContain('data-me3-audio="true"');
    expect(markdown).toContain("<figcaption>Grounding practice</figcaption>");
    expect(markdown).toContain("<audio controls");
    expect(markdown).toContain("./files/content/audio-id.mp3");
  });
});
