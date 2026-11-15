import { describe, expect, it } from "vitest";

import { matchShiftTemplate, SHIFT_TEMPLATES } from "./shiftTemplates";

describe("shift templates", () => {
  it("matches morning opening shift hours", () => {
    expect(matchShiftTemplate("06:30:00", "14:30:00")).toBe("morning");
    expect(SHIFT_TEMPLATES.morning.start).toBe("06:30");
  });

  it("matches evening closing shift hours", () => {
    expect(matchShiftTemplate("14:30", "22:30")).toBe("evening");
  });

  it("matches peak part-time shift hours", () => {
    expect(matchShiftTemplate("11:00", "15:00")).toBe("peak");
  });

  it("treats late starts as night", () => {
    expect(matchShiftTemplate("18:00:00", "23:00:00")).toBe("night");
  });
});
