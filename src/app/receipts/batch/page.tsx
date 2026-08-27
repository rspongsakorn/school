import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData, type ReceiptPrintData } from "@/lib/data/receipt-print";
import { BULK_PAYMENT_MAX } from "@/lib/finance/constants";
import { PrintButton } from "../print-button";
import { AutoPrint } from "../auto-print";
import { ReceiptCopy, ReceiptPrintStyles } from "../receipt-copy";

export const dynamic = "force-dynamic";

export default async function BatchReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; autoprint?: string }>;
}) {
  await requireFinancePage();

  const { ids, autoprint } = await searchParams;
  const rawIds = Array.isArray(ids) ? ids.join(",") : ids ?? "";
  const paymentIds = [...new Set(
    rawIds.split(",").map((id) => id.trim()).filter(Boolean),
  )].slice(0, BULK_PAYMENT_MAX);

  if (paymentIds.length === 0) notFound();

  const fetched = await Promise.allSettled(paymentIds.map((id) => getReceiptPrintData(id)));
  const receipts = paymentIds
    .map((paymentId, i) => {
      const result = fetched[i];
      const data = result.status === "fulfilled" ? result.value : null;
      return { paymentId, data };
    })
    .filter((r): r is { paymentId: string; data: ReceiptPrintData } => r.data !== null);
  if (receipts.length === 0) notFound();

  const missingCount = paymentIds.length - receipts.length;

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

      {missingCount > 0 ? (
        <div
          className="no-print"
          style={{
            textAlign: "center",
            margin: "24px 0 0",
            position: "relative",
            zIndex: 1,
            fontSize: "13px",
            color: "#b91c1c",
          }}
        >
          โหลดใบเสร็จไม่ได้ {missingCount} ใบ
        </div>
      ) : null}

      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "12px",
          margin: missingCount > 0 ? "8px 0 0" : "24px 0 0",
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

      {receipts.map(({ paymentId, data }) => (
        <Fragment key={paymentId}>
          <ReceiptCopy data={data} label="ต้นฉบับ" />
          <ReceiptCopy data={data} label="สำเนา" />
        </Fragment>
      ))}
    </>
  );
}
