"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type StudentSearchInputProps = {
  initialQuery: string;
  onDebouncedChange: (query: string) => void;
};

export function StudentSearchInput({ initialQuery, onDebouncedChange }: StudentSearchInputProps) {
  const [draft, setDraft] = useState(initialQuery);

  useEffect(() => {
    if (draft === initialQuery) return;

    const timeout = setTimeout(() => {
      onDebouncedChange(draft);
    }, 300);

    return () => clearTimeout(timeout);
  }, [draft, initialQuery, onDebouncedChange]);

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      placeholder="ค้นหารหัส ชื่อ หรือนามสกุล"
      className="w-full sm:max-w-sm"
    />
  );
}
