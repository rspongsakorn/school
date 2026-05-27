import { describe, expect, it } from "vitest";
import { reorderItems } from "@/lib/finance/reorder";

describe("reorderItems", () => {
  const items = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
  ];

  it("moves item down", () => {
    const result = reorderItems(items, 0, 2);
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("moves item up", () => {
    const result = reorderItems(items, 2, 0);
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("same index returns same order", () => {
    const result = reorderItems(items, 1, 1);
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate original array", () => {
    reorderItems(items, 0, 2);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
