import { cn } from "@/lib/utils";

/** Base shimmer block. Use for any loading placeholder. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-lg bg-muted", className)}
      {...props}
    />
  );
}

/** Table-shaped loading placeholder — previews header + rows so the
 *  loading state matches the content that follows. */
function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <Skeleton className="h-9 w-full" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full bg-muted/80" />
        ))}
      </div>
    </div>
  );
}

export { Skeleton, TableSkeleton };
