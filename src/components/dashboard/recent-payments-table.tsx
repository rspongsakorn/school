import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBaht } from "@/lib/format";
import type { RecentPaymentRow } from "@/lib/data/dashboard";

export function RecentPaymentsTable({ payments }: { payments: RecentPaymentRow[] }) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle>การชำระล่าสุด</CardTitle>
        <CardDescription>รายการชำระเงินล่าสุดจากฐานข้อมูล</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {payments.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">ยังไม่มีรายการชำระเงิน</p>
        ) : (
          <>
            {/* Mobile stacked cards */}
            <div className="sm:hidden divide-y divide-border">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{payment.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {payment.grade} · {payment.date}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      #{payment.id}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatBaht(payment.amount)}</span>
                    <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      {payment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ใบเสร็จ</TableHead>
                    <TableHead>ชื่อนักเรียน</TableHead>
                    <TableHead>ชั้น</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                    <TableHead>วันที่</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium tabular-nums">{payment.id}</TableCell>
                      <TableCell>{payment.name}</TableCell>
                      <TableCell>{payment.grade}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBaht(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.date}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
