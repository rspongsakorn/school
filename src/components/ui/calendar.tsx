"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  formatMonthDropdownThai,
  formatYearDropdownBE,
  THAI_MONTHS_LONG,
  toBuddhistYear,
} from "@/lib/students/dates";

import "react-day-picker/style.css";

function formatCaptionBuddhist(month: Date): string {
  return `${THAI_MONTHS_LONG[month.getMonth()]} ${toBuddhistYear(month.getFullYear())}`;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  ...props
}: DayPickerProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-2", className)}
      formatters={{
        formatCaption: formatCaptionBuddhist,
        formatYearDropdown: formatYearDropdownBE,
        formatMonthDropdown: formatMonthDropdownThai,
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
        dropdowns: cn(
          "flex w-full items-center justify-center gap-2",
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn("relative", defaultClassNames.dropdown_root),
        dropdown: cn(
          "h-8 appearance-none rounded-md border border-input bg-background pl-2 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          defaultClassNames.dropdown,
        ),
        caption_label: cn("pointer-events-none sr-only", defaultClassNames.caption_label),
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
