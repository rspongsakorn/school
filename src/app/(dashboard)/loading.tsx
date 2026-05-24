export default function DashboardLoading() {
  return (
    <>
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-56 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
      </div>
      <main className="p-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 space-y-2">
            <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="mb-4 flex gap-2">
            <div className="h-10 flex-1 max-w-sm animate-pulse rounded-md bg-muted" />
            <div className="h-10 w-44 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-md bg-muted/80" />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
