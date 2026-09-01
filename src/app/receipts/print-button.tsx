"use client";

interface PrintButtonProps {
  label?: string;
}

export function PrintButton({ label = "🖨 พิมพ์ใบเสร็จ" }: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: "8px 20px",
        background: "#166534",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontSize: "13px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
