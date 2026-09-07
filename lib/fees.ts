// Shared with both the eBay import (server) and the transactions table
// (client), so it can't carry a "server-only" import like lib/ebay-orders.ts.
// See estimateOrderFee's comment there for why this is a flat rate rather
// than a real per-order lookup.
export const ESTIMATED_FEE_RATE = 0.15;

export function estimateFee(salePricePerUnit: number, quantity: number): number {
  return salePricePerUnit * quantity * ESTIMATED_FEE_RATE;
}
