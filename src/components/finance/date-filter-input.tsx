"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { isCommittableDate } from "@/lib/reports/url-filters";

/**
 * A date filter whose value lives in the URL. While a date is being typed the
 * browser reports "" for the incomplete field; handing that to the URL would
 * snap the field back to the default under the user's fingers. So what is
 * typed stays local, and only a complete, real date is committed.
 */
export function DateFilterInput({
  value,
  onCommit,
  className,
}: {
  value: string;
  onCommit: (date: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  // Follow the URL when it changes from outside (Back, a link).
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  return (
    <Input
      type="date"
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (isCommittableDate(next) && next !== value) onCommit(next);
      }}
      className={className}
    />
  );
}
