import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData } from "@/lib/data/receipt-print";
import { PrintButton } from "../print-button";
import { AutoPrint } from "../auto-print";
import { ReceiptCopy, ReceiptPrintStyles } from "../receipt-copy";

export const dynamic = "force-dynamic";

export default async function ReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  await requireFinancePage();

  const { paymentId } = await params;
  const { autoprint } = await searchParams;
  const data = await getReceiptPrintData(paymentId);
  if (!data) notFound();

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

      {/* ── Print button (hidden on print) ── */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px",
          margin: "24px 0 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        <PrintButton />
        <a
          href="/payments"
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

      <ReceiptCopy data={data} label="ต้นฉบับ" />
      <ReceiptCopy data={data} label="สำเนา" />
    </>
  );
}
