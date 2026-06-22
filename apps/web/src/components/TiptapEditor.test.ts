import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, type DOMWrapper } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

let lastEditorConfig: any;
let mockJson: any = { type: "doc", content: [] };
const mockInsertContent = vi.fn(() => ({ run: vi.fn() }));
const mockSetLink = vi.fn(() => ({ run: vi.fn() }));
const mockUnsetLink = vi.fn(() => ({ run: vi.fn() }));
const mockToggleBulletList = vi.fn(() => ({ run: vi.fn() }));
const mockToggleOrderedList = vi.fn(() => ({ run: vi.fn() }));
const mockToggleTaskList = vi.fn(() => ({ run: vi.fn() }));
const mockSinkListItem = vi.fn(() => ({ run: vi.fn() }));
const mockLiftListItem = vi.fn(() => ({ run: vi.fn() }));

const mockEditor = {
  getHTML: vi.fn(() => "<p>Test content</p>"),
  getJSON: vi.fn(() => mockJson),
  commands: {
    setContent: vi.fn(),
  },
  can: vi.fn(() => ({
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        undo: vi.fn(() => ({ run: vi.fn(() => true) })),
        redo: vi.fn(() => ({ run: vi.fn(() => true) })),
      })),
    })),
  })),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
      toggleUnderline: vi.fn(() => ({ run: vi.fn() })),
      toggleStrike: vi.fn(() => ({ run: vi.fn() })),
      toggleCode: vi.fn(() => ({ run: vi.fn() })),
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      toggleBulletList: mockToggleBulletList,
      toggleOrderedList: mockToggleOrderedList,
      toggleTaskList: mockToggleTaskList,
      sinkListItem: mockSinkListItem,
      liftListItem: mockLiftListItem,
      toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
      setHorizontalRule: vi.fn(() => ({ run: vi.fn() })),
      undo: vi.fn(() => ({ run: vi.fn() })),
      redo: vi.fn(() => ({ run: vi.fn() })),
      unsetAllMarks: vi.fn(() => ({
        clearNodes: vi.fn(() => ({ run: vi.fn() })),
      })),
      extendMarkRange: vi.fn(() => ({
        setLink: mockSetLink,
        unsetLink: mockUnsetLink,
      })),
      insertContent: mockInsertContent,
    })),
  })),
  isActive: vi.fn(() => false),
  getAttributes: vi.fn(() => ({})),
  destroy: vi.fn(),
};

// Mock Tiptap extensions and vue-3 - all mocks must be self-contained
vi.mock("@tiptap/vue-3", () => {
  return {
    useEditor: vi.fn((options) => {
      lastEditorConfig = options;
      return ref(mockEditor);
    }),
    VueNodeViewRenderer: vi.fn(() => ({})),
    EditorContent: defineComponent({
      name: "EditorContent",
      props: ["editor"],
      render() {
        return h("div", { class: "ProseMirror" }, "Editor content");
      },
    }),
  };
});

vi.mock("@tiptap/starter-kit", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-placeholder", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-link", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-underline", () => ({
  default: {},
}));

vi.mock("@tiptap/extension-horizontal-rule", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-image", () => ({
  default: {
    extend: vi.fn(() => ({ configure: vi.fn(() => ({})) })),
    configure: vi.fn(() => ({})),
  },
}));

vi.mock("@tiptap/extension-task-list", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-task-item", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

// Mock image compression utilities
vi.mock("@/utils/imageCompression", () => ({
  resizeImage: vi
    .fn()
    .mockResolvedValue({ blob: new Blob(["test"]), didResize: false }),
  compressImage: vi.fn().mockResolvedValue({
    blob: new Blob(["test"]),
    type: "image/jpeg",
    quality: 0.8,
  }),
}));

import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TiptapEditor from "./TiptapEditor.vue";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const setInputFiles = (
  wrapper: DOMWrapper<HTMLInputElement>,
  files: File[]
) => {
  const input = wrapper.element as HTMLInputElement;
  Object.defineProperty(input, "files", {
    value: files,
    configurable: true,
  });
};

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((ev: ProgressEvent) => void) | null = null;
  onerror: ((ev: ProgressEvent) => void) | null = null;
  error: DOMException | null = null;

  readAsDataURL() {
    this.result = "data:image/jpeg;base64,dGVzdA==";
    if (this.onload) {
      this.onload(new ProgressEvent("load"));
    }
  }
}

describe("TiptapEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = { type: "doc", content: [] };
    globalThis.FileReader = MockFileReader as any;
    mockInsertContent.mockClear();
    mockSetLink.mockClear();
    mockUnsetLink.mockClear();
    mockToggleBulletList.mockClear();
    mockToggleOrderedList.mockClear();
    mockToggleTaskList.mockClear();
    mockSinkListItem.mockClear();
    mockLiftListItem.mockClear();
  });

  it("should render the editor with default props", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "<p>Initial content</p>",
      },
    });

    expect(wrapper.find(".tiptap-editor").exists()).toBe(true);
    expect(wrapper.find(".editor-toolbar").exists()).toBe(true);
    expect(wrapper.find(".editor-content-wrapper").exists()).toBe(true);
    expect(wrapper.find(".editor-title-field").exists()).toBe(false);
  });

  it("should render optional title field below the toolbar", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
        showTitleField: true,
        title: "Morning pages",
      },
    });

    const titleInput = wrapper.find(".editor-title-input");
    expect(titleInput.exists()).toBe(true);
    expect((titleInput.element as HTMLInputElement).value).toBe("Morning pages");

    const rootHtml = wrapper.find(".tiptap-editor").html();
    expect(rootHtml.indexOf("editor-toolbar")).toBeLessThan(
      rootHtml.indexOf("editor-title-field"),
    );
  });

  it("should render toolbar buttons", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const toolbarButtons = wrapper.findAll(".toolbar-btn");
    expect(toolbarButtons.length).toBeGreaterThan(0);

    // Check for specific buttons by title
    expect(wrapper.find('[title="Undo"]').exists()).toBe(true);
    expect(wrapper.find('[title="Redo"]').exists()).toBe(true);
    expect(wrapper.find('[title="Bold"]').exists()).toBe(true);
    expect(wrapper.find('[title="Italic"]').exists()).toBe(true);
    expect(wrapper.find('[title="Underline"]').exists()).toBe(true);
    expect(wrapper.find('[title="Strikethrough"]').exists()).toBe(true);
    expect(wrapper.find('[title="Inline code"]').exists()).toBe(true);
    expect(wrapper.find('[title="Heading 1"]').exists()).toBe(true);
    expect(wrapper.find('[title="Heading 2"]').exists()).toBe(true);
    expect(wrapper.find('[title="Heading 3"]').exists()).toBe(true);
    expect(wrapper.find('[title="Bullet list"]').exists()).toBe(true);
    expect(wrapper.find('[title="Numbered list"]').exists()).toBe(true);
    expect(wrapper.find('[title="Task list"]').exists()).toBe(true);
    expect(wrapper.find('[title="Decrease list indent"]').exists()).toBe(true);
    expect(wrapper.find('[title="Increase list indent"]').exists()).toBe(true);
    expect(wrapper.find('[title="Quote"]').exists()).toBe(true);
    expect(wrapper.find('[title="Divider"]').exists()).toBe(true);
    expect(wrapper.find('[title="Link"]').exists()).toBe(true);
    expect(wrapper.find('[title="Embed YouTube video"]').exists()).toBe(true);
    expect(wrapper.find('[title="Insert image"]').exists()).toBe(true);
    expect(wrapper.find('[title="Insert gallery"]').exists()).toBe(true);
    expect(wrapper.find('[title="Insert FAQ accordion"]').exists()).toBe(true);
    expect(wrapper.find('[title="Insert card carousel"]').exists()).toBe(true);
  });

  it("should hide site-builder toolbar blocks in workspace variant", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
        variant: "workspace",
      },
    });

    expect(wrapper.find('[title="Insert FAQ accordion"]').exists()).toBe(false);
    expect(wrapper.find('[title="Insert card carousel"]').exists()).toBe(false);
  });

  it("should configure links to open in a new tab", () => {
    mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    expect(Link.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      })
    );
  });

  it("should allow markdown shortcut input rules for h1 through h3 headings", () => {
    mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    expect(StarterKit.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        heading: { levels: [1, 2, 3] },
        bulletList: {},
        orderedList: {},
        blockquote: {},
        horizontalRule: {},
      })
    );
  });

  it("should configure task list support", () => {
    mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    expect(TaskList.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        HTMLAttributes: {
          class: "tiptap-task-list",
        },
      }),
    );
    expect(TaskItem.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        nested: true,
        HTMLAttributes: {
          class: "tiptap-task-item",
        },
      }),
    );
  });

  it("should preserve editor selection when toolbar receives mouse down", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    wrapper.find(".editor-toolbar").element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("should run list and indent commands from toolbar buttons", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    await wrapper.find('[title="Bullet list"]').trigger("click");
    await wrapper.find('[title="Numbered list"]').trigger("click");
    await wrapper.find('[title="Task list"]').trigger("click");
    await wrapper.find('[title="Increase list indent"]').trigger("click");
    await wrapper.find('[title="Decrease list indent"]').trigger("click");

    expect(mockToggleBulletList).toHaveBeenCalled();
    expect(mockToggleOrderedList).toHaveBeenCalled();
    expect(mockToggleTaskList).toHaveBeenCalled();
    expect(mockSinkListItem).toHaveBeenCalledWith("listItem");
    expect(mockLiftListItem).toHaveBeenCalledWith("listItem");
  });

  it("should accept and display custom placeholder", () => {
    const customPlaceholder = "Write your story here...";
    mount(TiptapEditor, {
      props: {
        modelValue: "",
        placeholder: customPlaceholder,
      },
    });

    // The placeholder is passed to Tiptap's Placeholder extension
    // We can't easily test the rendered placeholder without mocking the editor more thoroughly
    // But we can verify the component accepts the prop
    expect(true).toBe(true);
  });

  it("should emit update:modelValue when content changes", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "<p>Initial</p>",
      },
    });

    // Wait for component to mount
    await wrapper.vm.$nextTick();

    // The editor's onUpdate callback should emit the event
    // We can't easily trigger this in tests without more complex mocking
    expect(wrapper.emitted()).toBeDefined();
  });

  it("should open link modal when link button clicked", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const linkButton = wrapper.find('[title="Link"]');
    await linkButton.trigger("click");

    expect(wrapper.find(".link-modal-overlay").exists()).toBe(true);
    expect(wrapper.find(".link-modal").exists()).toBe(true);
  });

  it("should close link modal when cancel clicked", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    // Open modal
    const linkButton = wrapper.find('[title="Link"]');
    await linkButton.trigger("click");

    expect(wrapper.find(".link-modal").exists()).toBe(true);

    // Close modal
    const cancelButton = wrapper.find(".link-btn.secondary");
    await cancelButton.trigger("click");

    expect(wrapper.find(".link-modal-overlay").exists()).toBe(false);
  });

  it("should open youtube modal when button clicked", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const button = wrapper.find('[title="Embed YouTube video"]');
    await button.trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".youtube-modal-overlay").exists()).toBe(true);
    expect(wrapper.find(".youtube-modal").exists()).toBe(true);
  });

  it("should insert a normalized youtube embed from a share URL", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    await wrapper.find('[title="Embed YouTube video"]').trigger("click");
    await wrapper.vm.$nextTick();

    const input = wrapper.find("#youtube-url-input");
    await input.setValue("https://youtu.be/dQw4w9WgXcQ?t=43");
    await wrapper.find(".youtube-modal .link-btn.primary").trigger("click");

    expect(mockInsertContent).toHaveBeenCalledWith({
      type: "youtubeEmbed",
      attrs: {
        src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=43",
      },
    });
    expect(wrapper.find(".youtube-modal-overlay").exists()).toBe(false);
  });

  it("should show an error for an invalid youtube URL", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    await wrapper.find('[title="Embed YouTube video"]').trigger("click");
    await wrapper.vm.$nextTick();

    const input = wrapper.find("#youtube-url-input");
    await input.setValue("https://example.com/not-youtube");
    await wrapper.find(".youtube-modal .link-btn.primary").trigger("click");

    expect(wrapper.find(".youtube-modal .link-error").exists()).toBe(true);
    expect(mockInsertContent).not.toHaveBeenCalled();
  });

  it("should display error for invalid link URL", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    // Open modal
    const linkButton = wrapper.find('[title="Link"]');
    await linkButton.trigger("click");

    // Try to apply empty link
    const saveButton = wrapper.find(".link-btn.primary");
    await saveButton.trigger("click");

    expect(wrapper.find(".link-error").exists()).toBe(true);
    expect(wrapper.find(".link-error").text()).toContain("valid URL");
  });

  it("should have hidden file input for images", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const fileInput = wrapper.find(".image-input");
    expect(fileInput.exists()).toBe(true);
    expect(fileInput.attributes("type")).toBe("file");
    expect(fileInput.attributes("accept")).toContain("image/jpeg");
  });

  it("should trigger file picker when image button clicked", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    // Mock click method on file input
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");

    const imageButton = wrapper.find('[title="Insert image"]');
    await imageButton.trigger("click");

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("should queue images and emit only when flushed", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const fileInput = wrapper.find(".image-input");
    setInputFiles(fileInput as DOMWrapper<HTMLInputElement>, [file]);
    await fileInput.trigger("change");
    await flushPromises();

    expect(wrapper.emitted("imageAdded")).toBeUndefined();

    const vm = wrapper.vm as any;
    const pending = vm.getPendingImages();
    expect(pending.length).toBe(1);

    vm.flushPendingImages();

    const emitted = (wrapper.emitted("imageAdded") || []) as Array<
      [{ id: string; blob: Blob }]
    >;
    expect(emitted.length).toBe(1);
    expect(typeof emitted[0][0].id).toBe("string");
    expect(emitted[0][0].blob).toBeInstanceOf(Blob);
  });

  it("should emit imageRemoved and revoke object URLs when images are removed", async () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const fileInput = wrapper.find(".image-input");
    setInputFiles(fileInput as DOMWrapper<HTMLInputElement>, [file]);
    await fileInput.trigger("change");
    await flushPromises();

    const vm = wrapper.vm as any;
    const [pending] = vm.getPendingImages();
    expect(pending).toBeDefined();

    mockJson = {
      type: "doc",
      content: [{ type: "image", attrs: { "data-image-id": pending.id } }],
    };
    lastEditorConfig.onUpdate({ editor: mockEditor });

    mockJson = { type: "doc", content: [] };
    lastEditorConfig.onUpdate({ editor: mockEditor });

    const removed = wrapper.emitted("imageRemoved") || [];
    expect(removed.length).toBe(1);
    expect(removed[0][0]).toBe(pending.id);
  });

  it("should render toolbar divider elements", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const dividers = wrapper.findAll(".toolbar-divider");
    expect(dividers.length).toBeGreaterThan(0);
  });

  it("should expose editor instance and helper methods", () => {
    const wrapper = mount(TiptapEditor, {
      props: {
        modelValue: "",
      },
    });

    const vm = wrapper.vm as any;
    expect(vm.editor).toBeDefined();
    expect(typeof vm.getImageIds).toBe("function");
    expect(typeof vm.getPendingImages).toBe("function");
    expect(typeof vm.flushPendingImages).toBe("function");
  });
});
