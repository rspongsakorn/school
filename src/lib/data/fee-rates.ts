export type FeeRateMatrixItem = {
  id: string;
  name: string;
  hasReimbursableVariant: boolean;
};

export type FeeRateMatrixCell = {
  id: string;
  amount: number;
  amountReimbursable: number | null;
};

export type FeeRateMatrix = {
  grades: { id: string; name: string }[];
  items: FeeRateMatrixItem[];
  rates: Record<string, FeeRateMatrixCell>;
};
