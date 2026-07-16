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

  it("consolidates a partial payment (no discount) into one line named after the invoice type", () => {
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
    expect(result.lineItems).toEqual([{ name: "ค่าเทอม", amount: 500 }]);
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
