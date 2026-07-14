import { notFound } from "next/navigation";
import { requireFinancePage } from "@/lib/auth/require-finance";
import { getReceiptPrintData, type ReceiptPrintData } from "@/lib/data/receipt-print";
import { SCHOOL_CONFIG } from "@/lib/school-config";
import { formatThaiDateLong, bahtText } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { PrintButton } from "./print-button";
import { LogoImage } from "./logo-image";
import { AutoPrint } from "./auto-print";

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
      <style>{`
        @page { size: A5 portrait; margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
          .copy { break-after: page; }
          .copy:last-child { break-after: auto; }
        }
      `}</style>

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

function ReceiptCopy({ data, label }: { data: ReceiptPrintData; label: string }) {
  const paidAtLabel = formatThaiDateLong(data.paidAt);
  const methodLabel = PAYMENT_METHOD_LABELS[data.paymentMethod];

  return (
    <div
      className="copy"
      style={{
        width: "148mm",
        height: "210mm",
        boxSizing: "border-box",
        background: "white",
        margin: "32px auto",
        padding: "10mm",
        fontFamily: "var(--font-noto-sans-thai), var(--font-inter), sans-serif",
        fontSize: "12px",
        color: "#111",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
        <LogoImage src={SCHOOL_CONFIG.logoPath} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: "14px", color: "#166534" }}>
            {SCHOOL_CONFIG.name}
          </div>
          <div style={{ color: "#6b7280", fontSize: "10px", lineHeight: 1.6 }}>
            {SCHOOL_CONFIG.address}
          </div>
          <div style={{ color: "#6b7280", fontSize: "10px" }}>
            โทร. {SCHOOL_CONFIG.phone}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "16px", letterSpacing: "1px", color: "#111" }}>
            ใบเสร็จรับเงิน
          </div>
          <div style={{ marginTop: "3px", fontSize: "10px", fontWeight: 700, color: "#374151" }}>
            {label}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "2.5px solid #111", margin: "8px 0 10px" }} />

      {/* ── Info row ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          marginBottom: "10px",
          gap: "12px",
        }}
      >
        <div style={{ lineHeight: 1.8 }}>
          <div>
            <span style={{ color: "#6b7280" }}>ชื่อ–สกุล: </span>
            <strong>{data.studentName}</strong>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>รหัสนักเรียน: </span>
            {data.studentCode}
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>ชั้น/ห้อง: </span>
            {data.gradeClassroom}
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>ปีการศึกษา: </span>
            {data.academicYearName}
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>ภาคเรียนที่: </span>
            {data.semesterNumber}
          </div>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1.8 }}>
          <div>
            <span style={{ color: "#6b7280" }}>เลขที่: </span>
            <strong>{data.receiptNumber}</strong>
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>วันที่: </span>
            {paidAtLabel}
          </div>
          <div>
            <span style={{ color: "#6b7280" }}>วิธีชำระ: </span>
            {methodLabel}
          </div>
        </div>
      </div>

      {/* ── Fee line items table ── */}
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "10px" }}
      >
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            <th
              style={{ textAlign: "left", padding: "5px 8px", border: "1px solid #d1d5db" }}
            >
              รายการค่าใช้จ่าย
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "5px 8px",
                border: "1px solid #d1d5db",
                whiteSpace: "nowrap",
              }}
            >
              จำนวนเงิน (บาท)
            </th>
          </tr>
        </thead>
        <tbody>
          {data.lineItems.map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? "#fafafa" : "white" }}>
              <td style={{ padding: "5px 8px", border: "1px solid #e5e7eb" }}>{item.name}</td>
              <td
                style={{
                  textAlign: "right",
                  padding: "5px 8px",
                  border: "1px solid #e5e7eb",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.amount.toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {data.discounts.length > 0 ? (
            <>
              <tr>
                <td style={{ padding: "5px 8px", border: "1px solid #d1d5db", textAlign: "right" }}>รวม</td>
                <td style={{ textAlign: "right", padding: "5px 8px", border: "1px solid #d1d5db", fontVariantNumeric: "tabular-nums" }}>
                  {data.subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              {data.discounts.map((d, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 8px", border: "1px solid #e5e7eb", color: "#b91c1c" }}>
                    หัก ส่วนลด ({d.name})
                  </td>
                  <td style={{ textAlign: "right", padding: "5px 8px", border: "1px solid #e5e7eb", color: "#b91c1c", fontVariantNumeric: "tabular-nums" }}>
                    −{d.amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </>
          ) : null}
          <tr style={{ background: "#f0fdf4" }}>
            <td style={{ padding: "6px 8px", border: "1px solid #d1d5db", fontWeight: 800, fontSize: "12px" }}>
              รวมสุทธิ
            </td>
            <td style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #d1d5db", fontWeight: 800, fontSize: "13px", color: "#166534", fontVariantNumeric: "tabular-nums" }}>
              {data.amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ padding: "5px 8px", border: "1px solid #d1d5db", fontSize: "11px", color: "#374151" }}>
              <span style={{ color: "#6b7280" }}>จำนวนเงินเป็นอักษร: </span>
              <strong>{bahtText(data.amount)}</strong>
            </td>
          </tr>
        </tfoot>
      </table>

      {/* ── Remark ── */}
      <div
        style={{
          marginTop: "12px",
          fontSize: "10px",
          color: "#6b7280",
          borderTop: "1px dashed #d1d5db",
          paddingTop: "6px",
        }}
      >
        หมายเหตุ: ใบเสร็จฉบับนี้จะสมบูรณ์เมื่อผู้รับเงินลงลายมือชื่อ
      </div>

      {/* ── Signature ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto", paddingTop: "24px" }}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "120px",
              borderTop: "1px solid #111",
              paddingTop: "4px",
              fontSize: "10px",
            }}
          >
            ผู้รับเงิน: {data.recordedBy}
          </div>
        </div>
      </div>
    </div>
  );
}
