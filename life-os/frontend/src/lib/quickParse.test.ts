import { describe, expect, it } from "vitest";
import { parseQuick, stripWords } from "./quickParse";

const places = [{ id: "inv", title: "השקעות" }, { id: "prob", title: "מבוא להסתברות" }];
const today = "2026-09-30"; // Wednesday

describe("parseQuick", () => {
  it("reads tomorrow, a place and importance", () => {
    const p = parseQuick("להתקשר לבנק מחר #השקעות !", places, today);
    expect(p.date).toBe("2026-10-01");
    expect(p.parentId).toBe("inv");
    expect(p.important).toBe(true);
    expect(stripWords("להתקשר לבנק מחר #השקעות !", [p.dateText, p.parentText, p.importantText])).toBe("להתקשר לבנק");
  });

  it("reads a weekday as the next one", () => {
    expect(parseQuick("להגיש ביום ראשון", places, today).date).toBe("2026-10-04");
    expect(parseQuick("פגישה יום רביעי", places, today).date).toBe("2026-10-07");
  });

  it("reads a day.month date, rolling to next year when past", () => {
    expect(parseQuick("מבחן ב-15.10", places, today).date).toBe("2026-10-15");
    expect(parseQuick("יום הולדת 3/2", places, today).date).toBe("2027-02-03");
  });

  it("matches a multi-word place and a typed prefix", () => {
    expect(parseQuick("תרגיל #מבוא להסתברות", places, today).parentId).toBe("prob");
    expect(parseQuick("תרגיל #מבוא", places, today).parentId).toBe("prob");
  });

  it("leaves ordinary words alone", () => {
    const p = parseQuick("לקנות מתנה ליום הולדת", places, today);
    expect(p.date).toBeNull();
    expect(p.parentId).toBeNull();
    expect(p.important).toBe(false);
  });
});
