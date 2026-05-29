import Image from "next/image";
import { formatThaiDateLong } from "@/lib/format";

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
    <div className="report-letterhead hidden mb-4 border-b border-black pb-3 print:block">
      <div className="flex items-center gap-3">
        <Image src="/school-logo.png" alt="โลโก้โรงเรียน" width={56} height={56} className="rounded-full" />
        <div>
          <p className="text-lg font-bold">โรงเรียนบัวใหญ่วิทยา</p>
          <p className="text-sm">อ.บัวใหญ่ จ.นครราชสีมา</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="text-base font-semibold">{title}</p>
        {yearName ? (
          <p className="text-sm">
            ภาคเรียนที่ {semesterNumber ?? 1} · ปีการศึกษา {yearName}
          </p>
        ) : null}
        {subtitle ? <p className="text-sm">{subtitle}</p> : null}
        <p className="text-xs text-gray-600">พิมพ์เมื่อ {formatThaiDateLong(new Date())}</p>
      </div>
    </div>
  );
}
