import Image from "next/image";
import { formatThaiDateLong } from "@/lib/format";
import { SCHOOL_CONFIG } from "@/lib/school-config";

type ReportLetterheadProps = {
  title: string;
  yearName?: string;
  semesterNumber?: number;
  subtitle?: string;
};

export function ReportLetterhead({
  title,
  yearName,
  semesterNumber,
  subtitle,
}: ReportLetterheadProps) {
  return (
    <div className="report-letterhead hidden mb-4 pb-3 print:block">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image
            src={SCHOOL_CONFIG.logoPath}
            alt="โลโก้โรงเรียน"
            width={44}
            height={44}
            className="rounded-full border border-gray-300 object-cover"
          />
          <div>
            <p className="text-sm font-semibold">{SCHOOL_CONFIG.name}</p>
            <p className="text-[10px] text-gray-500">
              {SCHOOL_CONFIG.address} · {SCHOOL_CONFIG.phone}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-[#1f7a52]">{title}</p>
          {yearName ? (
            <p className="text-[10px] text-gray-400">
              ภาคเรียนที่ {semesterNumber ?? 1} / {yearName}
            </p>
          ) : null}
          {subtitle ? <p className="text-[10px] text-gray-400">{subtitle}</p> : null}
        </div>
      </div>
      <div
        className="mt-3 h-0.5 rounded-full"
        style={{ background: "linear-gradient(90deg, #1f7a52, #34aa79)" }}
      />
      <p className="mt-1 text-[10px] text-gray-500">พิมพ์เมื่อ {formatThaiDateLong(new Date())}</p>
    </div>
  );
}
