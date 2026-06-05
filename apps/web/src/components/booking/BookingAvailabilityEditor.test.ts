import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import BookingAvailabilityEditor, {
  type BookingAvailability,
} from "./BookingAvailabilityEditor.vue";

const emptyAvailability: BookingAvailability = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

function mountEditor(props: Partial<InstanceType<typeof BookingAvailabilityEditor>["$props"]> = {}) {
  return mount(BookingAvailabilityEditor, {
    props: {
      availability: emptyAvailability,
      bufferTime: 0,
      timezone: "UTC",
      ...props,
    },
    global: {
      stubs: {
        UiIcon: true,
      },
    },
  });
}

function latestEmittedAvailability(wrapper: ReturnType<typeof mountEditor>) {
  const events = wrapper.emitted("update:availability");
  return events?.[events.length - 1]?.[0] as BookingAvailability | undefined;
}

describe("BookingAvailabilityEditor", () => {
  it("emits weekday availability from the weekday preset", async () => {
    const wrapper = mountEditor();

    await wrapper.findAll(".preset-btn")[0].trigger("click");

    expect(latestEmittedAvailability(wrapper)).toMatchObject({
      monday: ["09:00-17:00"],
      tuesday: ["09:00-17:00"],
      wednesday: ["09:00-17:00"],
      thursday: ["09:00-17:00"],
      friday: ["09:00-17:00"],
      saturday: [],
      sunday: [],
    });
  });

  it("emits morning availability from the mornings preset", async () => {
    const wrapper = mountEditor();

    await wrapper.findAll(".preset-btn")[1].trigger("click");

    expect(latestEmittedAvailability(wrapper)).toMatchObject({
      monday: ["09:00-12:00"],
      tuesday: ["09:00-12:00"],
      wednesday: ["09:00-12:00"],
      thursday: ["09:00-12:00"],
      friday: ["09:00-12:00"],
      saturday: [],
      sunday: [],
    });
  });

  it("edits a single day and filters invalid windows", async () => {
    const wrapper = mountEditor({
      availability: {
        ...emptyAvailability,
        monday: ["10:00-11:00"],
      },
    });

    await wrapper.find(".day-action-btn").trigger("click");
    await wrapper.find("#booking-availability-windows").setValue(
      "09:00-12:00, nope, 14:00-17:00",
    );
    await wrapper.find(".btn.primary").trigger("click");

    expect(latestEmittedAvailability(wrapper)).toMatchObject({
      monday: ["09:00-12:00", "14:00-17:00"],
    });
  });

  it("clears one day and clears all days", async () => {
    const wrapper = mountEditor({
      availability: {
        ...emptyAvailability,
        monday: ["09:00-17:00"],
        friday: ["10:00-12:00"],
      },
    });

    await wrapper.find(".day-action-btn.danger").trigger("click");
    expect(latestEmittedAvailability(wrapper)).toMatchObject({
      monday: [],
      friday: ["10:00-12:00"],
    });

    await wrapper.findAll(".preset-btn")[2].trigger("click");
    expect(latestEmittedAvailability(wrapper)).toMatchObject({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    });
  });

  it("emits buffer and timezone updates", async () => {
    const wrapper = mountEditor({
      bufferTime: 5,
      timezone: "Europe/Dublin",
      timezoneOptions: [
        { value: "Europe/Dublin", label: "Dublin" },
        { value: "UTC", label: "UTC" },
      ],
    });

    await wrapper.find("#booking-availability-buffer").setValue("15");
    await wrapper.find("#booking-availability-timezone").setValue("UTC");

    expect(wrapper.emitted("update:bufferTime")).toEqual([[15]]);
    expect(wrapper.emitted("update:timezone")).toEqual([["UTC"]]);
  });
});
