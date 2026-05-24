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
        )}
      </CardContent>
    </Card>
  );
}
