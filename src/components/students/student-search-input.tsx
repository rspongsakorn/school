"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

type StudentSearchInputProps = {
  initialQuery: string;
  onDebouncedChange: (query: string) => void;
};

export function StudentSearchInput({ initialQuery, onDebouncedChange }: StudentSearchInputProps) {
  const [draft, setDraft] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDebouncedChangeRef = useRef(onDebouncedChange);
  onDebouncedChangeRef.current = onDebouncedChange;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(value: string) {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onDebouncedChangeRef.current(value);
    }, 300);
  }

  return (
    <Input
      value={draft}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="ค้นหารหัส ชื่อ หรือนามสกุล"
      className="w-full sm:max-w-sm"
    />
  );
}
