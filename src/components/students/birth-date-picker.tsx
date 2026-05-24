"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatThaiBirthDate, isoDateFromLocalDate, parseIsoDateOnly } from "@/lib/students/dates";

type BirthDatePickerProps = {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  "aria-invalid"?: boolean;
};

export function BirthDatePicker({
  id,
  value,
  onChange,
  disabled,
  "aria-invalid": ariaInvalid,
}: BirthDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoDateOnly(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start font-normal",
              !value && "text-muted-foreground",
            )}
          />
        }
      >
        <CalendarIcon className="size-4" />
        {value ? formatThaiBirthDate(value) : "เลือกวันเกิด"}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={{ after: new Date() }}
          onSelect={(date) => {
            if (!date) return;
            onChange(isoDateFromLocalDate(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
