// Lightweight, decoupled hand-off of measured quantities from TrueScale into the
// Quick Bid Estimator. TrueScale stages line items and navigates to the estimator;
// the estimator consumes them once on mount. Kept out of React context so neither
// component needs to know about the other.

export interface HandoffLine {
  size: string;
  item: string;
  qty: number;
  unit_price: number;
}

let pending: HandoffLine[] | null = null;

/** Stage line items to be picked up by the next Quick Bid Estimator mount. */
export function stageBidLines(lines: HandoffLine[]): void {
  pending = lines.length ? lines : null;
}

/** Retrieve and clear any staged line items. */
export function consumeBidLines(): HandoffLine[] | null {
  const out = pending;
  pending = null;
  return out;
}
