import { describe, expect, it } from "vitest";
import { computeReceiptLineItems } from "@/lib/finance/receipt-line-items";

describe("computeReceiptLineItems", () => {
  it("expands a fully-paid invoice into its individual fee lines", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "2000",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1500", fee_items: { name: "ค่าเทอม" } },
              { amount: "500", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [],
    );
    expect(result.lineItems).toEqual([
      { name: "ค่าเทอม", amount: 1500 },
      { name: "ค่าอาหารกลางวัน", amount: 500 },
    ]);
    expect(result.subtotal).toBe(2000);
    expect(result.discounts).toEqual([]);
  });

  it("expands into fee lines when a discount exists, even if the paid amount is less than the line total", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "1000",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1200", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [{ amount: "200", fee_items: { name: "ค่าอาหารกลางวัน" } }],
    );
    expect(result.lineItems).toEqual([{ name: "ค่าอาหารกลางวัน", amount: 1200 }]);
    expect(result.subtotal).toBe(1200);
    expect(result.discounts).toEqual([{ name: "ค่าอาหารกลางวัน", amount: 200 }]);
  });

  it("splits a partial payment (no discount) across the fee lines proportionally", () => {
    const result = computeReceiptLineItems(
      [
        {
          amount: "500",
          student_invoices: {
            invoice_types: { name: "ค่าเทอม" },
            invoice_lines: [
              { amount: "1500", fee_items: { name: "ค่าเทอม" } },
              { amount: "500", fee_items: { name: "ค่าอาหารกลางวัน" } },
            ],
          },
        },
      ],
      [],
    );
    expect(result.lineItems).toEqual([
      { name: "ค่าเทอม", amount: 375 },
      { name: "ค่าอาหารกลางวัน", amount: 125 },
    ]);
    expect(result.subtotal).toBe(500);
  });

  it("skips an allocation whose invoice is missing", () => {
    const result = computeReceiptLineItems(
      [{ amount: "500", student_invoices: null }],
      [],
    );
    expect(result.lineItems).toEqual([]);
    expect(result.subtotal).toBe(0);
  });
});

describe("computeReceiptLineItems with recorded lines", () => {
  const allocation = {
    amount: "10500",
    student_invoices: {
      invoice_types: { name: "ค่าธรรมเนียม" },
      invoice_lines: [
        { amount: "8000", fee_items: { name: "ค่าเทอม" } },
        { amount: "2500", fee_items: { name: "ค่าอาหาร" } },
        { amount: "1500", fee_items: { name: "ค่าห้องปรับอากาศ" } },
      ],
    },
  };

  it("lists only the lines the payment settled, at their real amounts", () => {
    const result = computeReceiptLineItems([allocation], [], [
      { amount: "8000", invoice_lines: { amount: "8000", fee_items: { name: "ค่าเทอม" } } },
      { amount: "2500", invoice_lines: { amount: "2500", fee_items: { name: "ค่าอาหาร" } } },
    ]);
    expect(result.lineItems).toEqual([
      { name: "ค่าเทอม", amount: 8000 },
      { name: "ค่าอาหาร", amount: 2500 },
    ]);
    expect(result.subtotal).toBe(10500);
    expect(result.discounts).toEqual([]);
  });

  it("shows a discounted line at full price with the discount listed apart", () => {
    const result = computeReceiptLineItems(
      [{ ...allocation, amount: "10000" }],
      [{ amount: "500", fee_items: { name: "ค่าเทอม" } }],
      [
        { amount: "7500", invoice_lines: { amount: "8000", fee_items: { name: "ค่าเทอม" } } },
        { amount: "2500", invoice_lines: { amount: "2500", fee_items: { name: "ค่าอาหาร" } } },
      ],
    );
    expect(result.lineItems).toEqual([
      { name: "ค่าเทอม", amount: 8000 },
      { name: "ค่าอาหาร", amount: 2500 },
    ]);
    expect(result.discounts).toEqual([{ name: "ค่าเทอม", amount: 500 }]);
  });
});
