import { describe, expect, it } from "vitest";
import { isLastAdmin } from "./users";

const p = (id: string, role: string, is_active: boolean) => ({ id, role, is_active });

describe("isLastAdmin", () => {
  it("returns true when the excluded user is the only active admin", () => {
    expect(isLastAdmin([p("a", "admin", true)], "a")).toBe(true);
  });

  it("returns false when another active admin exists", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "admin", true)], "a")).toBe(false);
  });

  it("returns true when other admins are inactive", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "admin", false)], "a")).toBe(true);
  });

  it("ignores finance and teacher roles", () => {
    expect(isLastAdmin([p("a", "admin", true), p("b", "finance", true)], "a")).toBe(true);
  });

  it("returns false when excluded user is not the only admin", () => {
    expect(
      isLastAdmin([p("a", "admin", true), p("b", "admin", true), p("c", "teacher", true)], "a"),
    ).toBe(false);
  });
});
