import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate every client query whose data depends on invoices or payments.
 *
 * Recording, voiding, or importing a payment — and generating or deleting
 * invoices — all change the numbers shown on the dashboard (collected total,
 * collection rate, overdue, recent payments, grade stats). Call this after any
 * such mutation so no view is left showing stale figures. Invalidating a key
 * with no active query is a harmless no-op, so it is safe to call everywhere.
 */
export function invalidateFinanceQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["payments"] });
  void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  void queryClient.invalidateQueries({ queryKey: ["invoice-candidates"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
