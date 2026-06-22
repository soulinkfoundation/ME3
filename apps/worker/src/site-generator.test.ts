import { describe, expect, it } from "vitest";
import { generateSiteHtml } from "./site-generator";

describe("site generator", () => {
  it("generates me3 profile pages from me.json and markdown sources", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "test site",
        handle: "test",
        bio: "A generated ME3 site.",
        avatar: "./files/avatar.jpg",
        banner: "./files/banner.jpg",
        links: { _vibe: "tech" },
        buttons: [{ text: "Join my course", url: "https://example.com/course" }],
        pages: [{ slug: "about", title: "About", file: "about.md" }],
      },
      [{ name: "about.md", content: "# About\n\nGenerated from markdown." }],
    );

    expect(files["index.html"]).toContain('body data-vibe="tech"');
    expect(files["index.html"]).toContain('src="./files/avatar.jpg"');
    expect(files["index.html"]).toContain("Join my course");
    expect(files["about.html"]).toContain("Generated from markdown.");
    expect(files["me.json"]).toContain('"handle": "test"');
  });

  it("renders concise public locations from structured location data", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Cork Coach",
        location: "Cork, County Cork, Eire / Ireland",
        locationData: {
          label: "Cork, County Cork, Eire / Ireland",
          latitude: 51.89851,
          longitude: -8.47264,
          precision: "city",
          region: "County Cork",
          country: "Eire / Ireland",
          countryCode: "IE",
        },
      },
      [],
    );

    expect(files["index.html"]).toContain("Cork, Ireland");
    expect(files["index.html"]).not.toContain("County Cork, Eire / Ireland");
  });

  it("uses custom link labels for platform icons", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Links Site",
        links: {
          custom_youtube: "kieranbutler",
          custom_youtube_label: "Youtube",
        },
      },
      [],
    );

    expect(files["index.html"]).toContain('aria-label="Youtube"');
    expect(files["index.html"]).toContain("M23.498 6.186");
  });

  it("renders escaped markdown links and images as html", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Markdown Site",
        pages: [
          { slug: "now", title: "Now", file: "now.md" },
          { slug: "about", title: "About", file: "about.md" },
        ],
        posts: [
          {
            slug: "hello",
            title: "Hello",
            file: "blog/hello.md",
            publishedAt: "2026-02-03",
            excerpt: "A short hello from the blog.",
          },
        ],
      },
      [
        {
          name: "now.md",
          content:
            "### Work\n\n\\[\\*\\*ME3\\*\\*\\](https://me3.app)\n\n![Alt text](./files/now-1.webp)",
        },
        {
          name: "about.md",
          content:
            '<figure><img src="https://example.com/preview/testuser/files/about-1.webp" alt="About"></figure>',
        },
        {
          name: "blog/hello.md",
          content:
            '<figure><img src="/preview/testuser/files/post-1.webp" alt="Post"></figure>',
        },
      ],
    );

    expect(files["now.html"]).toContain("<h3>Work</h3>");
    expect(files["now.html"]).toContain(
      '<a href="https://me3.app" target="_blank" rel="noopener"><strong>ME3</strong></a>',
    );
    expect(files["now.html"]).toContain(
      '<img src="./files/now-1.webp" alt="Alt text"',
    );
    expect(files["about.html"]).toContain('src="./files/about-1.webp"');
    expect(files["blog/hello.html"]).toContain('src="../files/post-1.webp"');
    expect(files["now.html"]).not.toContain("\\[\\*\\*ME3");
  });

  it("normalizes stale preview-prefixed profile image paths", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Preview Asset Site",
        avatar: "./preview/testuser/files/avatar.jpg",
        banner: "/preview/testuser/files/banner.jpg",
      },
      [],
    );

    expect(files["index.html"]).toContain('src="./files/avatar.jpg"');
    expect(files["index.html"]).toContain('src="./files/banner.jpg"');
    expect(files["index.html"]).not.toContain("/preview/testuser/files/");
  });

  it("renders homepage booking, testimonials, and newsletter like the app site", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Booking Site",
        avatar: "./files/avatar.jpg",
        links: {
          _vibe: "tech",
          x: "kieranbutler",
          instagram: "kieranbutler",
          linkedin: "kieranbutler",
          email: "hello@example.com",
          substack: "soulink",
        },
        buttons: [{ text: "Join Soulink", url: "https://soulink.app", icon: "Infinity" }],
        testimonials: [
          {
            name: "Alie Rae",
            quote:
              "Kieran was a pleasure to work with. Incredibly talented in technology.",
            handle: "Author",
            profileUrl: "https://example.com",
          },
          {
            name: "Jane Doe",
            quote: "A grounded, generous collaborator.",
            handle: "Founder",
          },
        ],
        intents: {
          subscribe: {
            enabled: true,
            title: "Newsletter",
            description: "Ideas from the future.",
          },
          book: {
            enabled: true,
            title: "Book a call",
            description: "Choose what fits.",
            bufferTime: 15,
            availability: { timezone: "Europe/Dublin", windows: { monday: ["09:00"] } },
            offers: [
              { title: "ME3 Setup", duration: 60, pricing: { enabled: false } },
              {
                title: "Coaching call",
                duration: 60,
                pricing: {
                  enabled: true,
                  currency: "EUR",
                  suggestedAmount: 75,
                  allowFlexiblePricing: true,
                },
              },
            ],
          },
        },
      },
      [],
    );

    expect(files["index.html"]).toContain("<h2>Book a session</h2>");
    expect(files["index.html"]).not.toContain("<h2>Book a call</h2>");
    expect(files["index.html"]).toContain('<link rel="icon" href="./files/avatar.jpg">');
    expect(files["index.html"]).toContain('<link rel="apple-touch-icon" href="./files/avatar.jpg">');
    expect(files["index.html"]).toContain('href="https://x.com/kieranbutler"');
    expect(files["index.html"]).toContain('href="https://instagram.com/kieranbutler"');
    expect(files["index.html"]).toContain('href="https://linkedin.com/in/kieranbutler"');
    expect(files["index.html"]).toContain('href="mailto:hello@example.com"');
    expect(files["index.html"]).toContain('href="https://soulink.substack.com/"');
    expect(files["index.html"]).toContain('class="btn-icon"><svg');
    expect(files["index.html"]).not.toContain(">Infinity</span>");
    expect(files["index.html"]).toContain("ME3 Setup");
    expect(files["index.html"]).toContain("Coaching call");
    expect(files["index.html"]).toContain("From €75");
    expect(files["index.html"]).toContain("Choose an offer");
    expect(files["index.html"]).toContain('type="date"');
    expect(files["index.html"]).toContain("data-booking-date-wrap");
    expect(files["index.html"]).toContain("showPicker");
    expect(files["index.html"]).toContain("cursor:pointer");
    expect(files["index.html"]).toContain('pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"');
    expect(files["index.html"]).toContain("setCustomValidity(hasInvalidEmail?'Enter a valid email address.':'')");
    expect(files["index.html"]).toContain("if(!validateForm()) return;");
    expect(files["index.html"]).toContain("'/free'");
    expect(files["index.html"]).toContain("form.reset();dateInput.value='';selectedTime='';timeInput.value=''");
    expect(files["index.html"]).toContain("slotsEl.hidden=true;emptyEl.hidden=true;setStatus('Your booking is confirmed.')");
    expect(files["index.html"]).toContain("Your booking is confirmed.");
    expect(files["index.html"]).toContain("data-booking-status");
    expect(files["index.html"]).toContain("clearBookingParams()");
    expect(files["index.html"]).toContain("url.searchParams.delete('booking')");
    expect(files["index.html"]).toContain("url.searchParams.delete('session_id')");
    expect(files["index.html"]).toContain("showReturnStatus('Confirming your booking...')");
    expect(files["index.html"]).toContain("A confirmation email will be sent soon");
    expect(files["index.html"]).not.toContain("if this site has email sending configured");
    expect(files["index.html"]).not.toContain("Your booking request is ready.");
    expect(files["index.html"]).toContain('"bufferTime":15');
    expect(files["index.html"]).toContain("t+=slotStep");
    expect(files["index.html"]).toContain("button.dataset.timeValue=value");
    expect(files["index.html"]).toContain("var slotButton=event.currentTarget");
    expect(files["index.html"]).toContain("item.classList.toggle('active',item===slotButton)");
    expect(files["index.html"]).toContain("No available times on this day.");
    expect(files["index.html"]).toContain('<h3 class="section-title">Testimonials</h3>');
    expect(files["index.html"]).toContain('class="testimonials-carousel"');
    expect(files["index.html"]).toContain("EmblaCarousel");
    expect(files["index.html"]).toContain("testimonial-quote");
    expect(files["index.html"]).toContain('<h2 class="newsletter-title">Newsletter</h2>');
    expect(files["index.html"]).toContain('class="newsletter-form"');
    expect(files["index.html"]).toContain("No spam. Unsubscribe anytime.");
    expect(files["index.html"]).toContain("body[data-vibe=tech] .name{font-size:24px");
    expect(files["index.html"]).toContain("body[data-vibe=tech] .newsletter input[type=email]");
    expect(files["index.html"]).not.toContain("readonly");
  });

  it("publishes me3 vibe with rounded green CTAs and rounded blocks", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "ME3 Site",
        links: { _vibe: "me3" },
        buttons: [{ text: "Personal AI Assistant", url: "https://example.com" }],
        intents: {
          subscribe: { enabled: true, title: "Newsletter" },
          book: {
            enabled: true,
            title: "Book a call",
            offers: [{ title: "ME3 Setup", duration: 60, pricing: { enabled: false } }],
          },
        },
      },
      [],
    );

    expect(files["index.html"]).toContain('body data-vibe="me3"');
    expect(files["index.html"]).toContain("--accent:#3d9b7c");
    expect(files["index.html"]).toContain(".cta-button.primary{background:var(--accent);color:#ffffff}");
    expect(files["index.html"]).toContain(".cta-button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:12px 16px;border-radius:var(--radius-md)");
    expect(files["index.html"]).toContain(".link-item{width:56px;height:56px;border-radius:999px");
    expect(files["index.html"]).toContain(".testimonials,.booking,.newsletter{margin:32px 0;padding:40px 48px;border-radius:24px;background:var(--border)}");
    expect(files["index.html"]).toContain(".content{margin:32px 0;padding:32px;background:transparent;border-radius:0}");
    expect(files["index.html"]).toContain(".booking-card{border:0;border-radius:16px");
    expect(files["index.html"]).toContain(".booking-back,.booking-submit{font:inherit;font-weight:800;border:0;border-radius:18px");
    expect(files["index.html"]).toContain("Confirm Booking");
    expect(files["index.html"]).toContain("placeholder=\"Your name\"");
    expect(files["index.html"]).toContain(".newsletter button{font:inherit;font-weight:800;border:0;border-radius:var(--radius-md);background:var(--accent);color:#ffffff");
  });

  it("uses title-derived blog and offerings paths in generated navigation", async () => {
    const files = await generateSiteHtml(
      {
        version: "0.1",
        name: "Path Site",
        pages: [{ slug: "writing", title: "Writing", file: "writing.md" }],
        posts: [
          {
            slug: "hello",
            title: "Hello",
            file: "blog/hello.md",
            publishedAt: "2026-02-03",
            excerpt: "A short hello from the blog.",
          },
        ],
        products: [
          {
            slug: "pai-setup",
            title: "Pai Setup",
            file: "shop/pai-setup.md",
            price: 7500,
            currency: "EUR",
            excerpt: "Get help setting up a personal AI assistant.",
          },
        ],
        blogTitle: "Writing",
        shopTitle: "Work With Me",
      },
      [
        { name: "writing.md", content: "# Writing" },
        { name: "blog/hello.md", content: "# Hello" },
        { name: "shop/pai-setup.md", content: "# Pai Setup" },
      ],
    );

    expect(files["work-with-me/index.html"]).toContain("Pai Setup");
    expect(files["work-with-me/index.html"]).toContain("75.00 EUR");
    expect(files["work-with-me/index.html"]).toContain("Get help setting up a personal AI assistant.");
    expect(files["work-with-me/pai-setup.html"]).toContain("<h1>Pai Setup</h1>");
    expect(files["writing-1/index.html"]).toContain("Hello");
    expect(files["writing-1/index.html"]).toContain("2/3/2026");
    expect(files["writing-1/index.html"]).toContain("A short hello from the blog.");
    expect(files["index.html"]).toContain('href="./work-with-me/"');
    expect(files["index.html"]).not.toContain('href="./shop/"');
  });
});
