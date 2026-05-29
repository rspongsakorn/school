"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportToolbar() {
  return (
    <div className="report-toolbar flex justify-end">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        พิมพ์
      </Button>
    </div>
  );
}
