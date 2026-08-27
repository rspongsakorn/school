import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData, type ReceiptPrintData } from "@/lib/data/receipt-print";
import { PrintButton } from "../print-button";
import { AutoPrint } from "../auto-print";
import { ReceiptCopy, ReceiptPrintStyles } from "../receipt-copy";

export const dynamic = "force-dynamic";

/** Matches BULK_PAYMENT_MAX in src/lib/actions/payments.ts. */
const MAX_RECEIPTS = 100;

export default async function BatchReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; autoprint?: string }>;
}) {
  await requireFinancePage();

  const { ids, autoprint } = await searchParams;
  const paymentIds = (ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_RECEIPTS);

  if (paymentIds.length === 0) notFound();

  const fetched = await Promise.all(paymentIds.map((id) => getReceiptPrintData(id)));
  const receipts = fetched.filter((d): d is ReceiptPrintData => d !== null);
  if (receipts.length === 0) notFound();

  return (
    <>
      {autoprint ? <AutoPrint /> : null}
      <ReceiptPrintStyles />

      {/* Gray background for screen — hidden on print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          background: "#f3f4f6",
          zIndex: 0,
        }}
      />

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "12px",
          margin: "24px 0 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <PrintButton label={`🖨 พิมพ์ใบเสร็จ ${receipts.length} ใบ`} />
        <a
          href="/invoices"
          style={{
            padding: "8px 16px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#374151",
            textDecoration: "none",
            fontFamily: "inherit",
          }}
        >
          กลับ
        </a>
      </div>

      {receipts.map((data) => (
        <Fragment key={data.receiptNumber}>
          <ReceiptCopy data={data} label="ต้นฉบับ" />
          <ReceiptCopy data={data} label="สำเนา" />
        </Fragment>
      ))}
    </>
  );
}
