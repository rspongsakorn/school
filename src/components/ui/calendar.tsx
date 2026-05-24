"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { toBuddhistYear } from "@/lib/students/dates";

import "react-day-picker/style.css";

const THAI_MONTHS_LONG = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
] as const;

function formatCaptionBuddhist(month: Date): string {
  return `${THAI_MONTHS_LONG[month.getMonth()]} ${toBuddhistYear(month.getFullYear())}`;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  formatters,
  ...props
}: DayPickerProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      formatters={{
        formatCaption: formatCaptionBuddhist,
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col gap-2", defaultClassNames.months),
        month: cn("flex flex-col gap-2", defaultClassNames.month),
        nav: cn("flex items-center justify-between gap-1", defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-8 flex-1 items-center justify-center text-sm font-medium",
          defaultClassNames.month_caption,
        ),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-8 text-center text-xs font-normal text-muted-foreground",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 flex w-full", defaultClassNames.week),
        day: cn("relative p-0 text-center", defaultClassNames.day),
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-8 font-normal",
          defaultClassNames.day_button,
        ),
        selected: cn("bg-primary text-primary-foreground", defaultClassNames.selected),
        today: cn("bg-muted text-foreground", defaultClassNames.today),
        outside: cn("text-muted-foreground opacity-50", defaultClassNames.outside),
        disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
          return <Icon className={cn("size-4", chevronClassName)} {...chevronProps} />;
        },
      }}
      {...props}
    />
  );
}

export { Calendar };
