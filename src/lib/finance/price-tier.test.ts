import { describe, expect, it } from "vitest";
import {
  PRICE_TIERS,
  parsePriceTier,
  parsePriceTierLabel,
  priceTierLabel,
} from "./price-tier";

describe("PRICE_TIERS", () => {
  it("lists the three tiers in display order", () => {
    expect(PRICE_TIERS).toEqual(["standard", "reimbursable", "private"]);
  });
});

describe("parsePriceTier", () => {
  it("accepts the three tier codes", () => {
    expect(parsePriceTier("standard")).toBe("standard");
    expect(parsePriceTier("reimbursable")).toBe("reimbursable");
    expect(parsePriceTier("private")).toBe("private");
  });

  it("returns null for anything else", () => {
    expect(parsePriceTier("all")).toBeNull();
    expect(parsePriceTier("")).toBeNull();
    expect(parsePriceTier(null)).toBeNull();
    expect(parsePriceTier(undefined)).toBeNull();
  });
});

describe("priceTierLabel", () => {
  it("returns the Thai label for each tier", () => {
    expect(priceTierLabel("standard")).toBe("เบิกไม่ได้");
    expect(priceTierLabel("reimbursable")).toBe("เบิกได้");
    expect(priceTierLabel("private")).toBe("เอกชน");
  });
});

describe("parsePriceTierLabel", () => {
  it("maps the Thai labels back to tiers", () => {
    expect(parsePriceTierLabel("เบิกไม่ได้")).toBe("standard");
    expect(parsePriceTierLabel("เบิกได้")).toBe("reimbursable");
    expect(parsePriceTierLabel("เอกชน")).toBe("private");
  });

  it("trims surrounding whitespace", () => {
    expect(parsePriceTierLabel("  เอกชน  ")).toBe("private");
  });

  it("treats an empty value as standard", () => {
    expect(parsePriceTierLabel("")).toBe("standard");
    expect(parsePriceTierLabel("   ")).toBe("standard");
  });

  it("returns null for unrecognised text", () => {
    expect(parsePriceTierLabel("เบิก")).toBeNull();
    expect(parsePriceTierLabel("private")).toBeNull();
  });
});
