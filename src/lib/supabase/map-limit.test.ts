import { describe, it, expect } from "vitest";
import { mapLimit } from "./map-limit";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("mapLimit", () => {
  it("returns results in the input order, whatever order they finish in", async () => {
    const result = await mapLimit([30, 1, 15, 5], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms * 10;
    });
    expect(result).toEqual([300, 10, 150, 50]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 10 }, (_, i) => i), 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    expect(peak).toBe(4);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 4, async (x: number) => x)).toEqual([]);
  });

  it("rejects when any task fails, rather than returning part of the rows", async () => {
    await expect(
      mapLimit([1, 2, 3], 2, async (x) => {
        if (x === 2) throw new Error("page failed");
        return x;
      }),
    ).rejects.toThrow("page failed");
  });
});
