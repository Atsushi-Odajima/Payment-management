import { describe, expect, it } from "vitest";
import { startOfDayInTz, tzOffsetMs } from "./time";

describe("startOfDayInTz (Asia/Tokyo)", () => {
  it("returns JST midnight (15:00 UTC previous day)", () => {
    const noonJst = new Date("2026-09-01T03:00:00Z"); // 12:00 JST Sep 1
    expect(startOfDayInTz(noonJst).toISOString()).toBe("2026-08-31T15:00:00.000Z");
  });

  it("rolls the day at 15:00 UTC, not at UTC midnight", () => {
    const before = new Date("2026-09-01T14:59:59Z"); // 23:59:59 JST Sep 1
    const after = new Date("2026-09-01T15:00:00Z"); // 00:00 JST Sep 2
    expect(startOfDayInTz(before).toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(startOfDayInTz(after).toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });

  it("handles other zones", () => {
    const d = new Date("2026-03-15T12:00:00Z");
    expect(startOfDayInTz(d, "UTC").toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(startOfDayInTz(d, "America/New_York").toISOString()).toBe("2026-03-15T04:00:00.000Z"); // EDT
  });

  it("computes the JST offset as +9h", () => {
    expect(tzOffsetMs(new Date("2026-09-01T00:00:00Z"), "Asia/Tokyo")).toBe(9 * 60 * 60 * 1000);
  });
});
