import { prisma } from "@/lib/prisma";
import type { PricePoint } from "@/lib/cards";
import { parseLocalDate, toDateKey } from "@/lib/chart-format";
import {
  buildPortfolioSeries,
  itemValueAt,
  getPortfolioData,
  deltaOverDays,
  type PortfolioItem,
  type PortfolioSeries,
} from "@/lib/portfolio";
import { computeMovers } from "@/lib/dashboard";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;
// Largest-first: pickMilestoneFact walks this reversed so a $50k week
// reports "$50,000", not "$1,000".
const MILESTONE_THRESHOLDS = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000];

export type PulseDriver = {
  itemType: "card" | "sealed";
  itemId: string;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  changeAbs: number;
  changePct: number;
};

export type NarrativeFact = {
  kind: "net-change" | "driver-segment" | "top-mover" | "milestone" | "onboarding";
  text: string;
  tone: "positive" | "negative" | "neutral";
};

export type DashboardPulse = {
  status: "full" | "thin-history" | "no-history";
  windowLabel: string;
  windowCaption: string;
  totalValue: number;
  netChange: { abs: number; pct: number };
  facts: NarrativeFact[];
  driver: PulseDriver | null;
  sparkline: PricePoint[];
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function signedMoney(value: number): string {
  const formatted = money.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPct(value: number): string {
  const formatted = pctFmt.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// A week that moved less than a dollar, or less than a tenth of a percent, is
// noise -- reporting "+$0.42, +0.003%" as a directional story would be false
// precision, so it collapses to a flat/neutral read instead.
export function isFlatChange(abs: number, pct: number): boolean {
  return Math.abs(abs) < 1 || Math.abs(pct) < 0.001;
}

// Denominator is the sum of *absolute* segment changes, not the net -- if
// cards are up $500 and sealed is down $300 (net +$200), cards didn't "drive
// 250%" of the move; it drove 500/(500+300) = 62.5% of the total motion.
// Returns null when neither segment moved (nothing to attribute).
export function computeSegmentShare(
  cardChangeAbs: number,
  sealedChangeAbs: number
): { cardShare: number; sealedShare: number } | null {
  const denom = Math.abs(cardChangeAbs) + Math.abs(sealedChangeAbs);
  if (denom === 0) return null;
  return {
    cardShare: Math.abs(cardChangeAbs) / denom,
    sealedShare: Math.abs(sealedChangeAbs) / denom,
  };
}

function formatDayMonth(dateKey: string): string {
  const d = parseLocalDate(dateKey);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
}

// "29 Jul" or, spanning two calendar days, "29 Jul – 5 Aug".
export function formatWindowCaption(startKey: string, endKey: string): string {
  const start = formatDayMonth(startKey);
  const end = formatDayMonth(endKey);
  return start === end ? start : `${start} – ${end}`;
}

// Pure milestone picker: a specific round-number crossing beats a generic
// "all-time high" callout when both are true, since a number is more
// informative than a superlative. A threshold only counts if it was crossed
// *within this window* -- still being above $10k from three weeks ago isn't
// news. `windowStartValue`/`netAbs` are passed in rather than recomputed so
// this stays a pure function of already-derived numbers, testable without a
// database.
export function pickMilestoneFact(
  history: PricePoint[],
  windowStartKey: string,
  totalValue: number,
  windowStartValue: number,
  netAbs: number
): string | null {
  const pointsBeforeWindow = history.filter((p) => p.date < windowStartKey);
  for (const threshold of [...MILESTONE_THRESHOLDS].reverse()) {
    const alreadyCrossed = pointsBeforeWindow.some((p) => p.price >= threshold);
    if (!alreadyCrossed && windowStartValue < threshold && totalValue >= threshold) {
      return `Crossed ${money.format(threshold)} for the first time.`;
    }
  }
  if (history.length === 0) return null;
  const historyMax = Math.max(...history.map((p) => p.price));
  if (netAbs > 0 && totalValue >= historyMax) {
    return "That's a new all-time high.";
  }
  return null;
}

type Series = Pick<PortfolioSeries, "cardSeries" | "sealedSeries">;

// Hero art fallback for accounts with too little price history to have a
// "mover" (computeMovers needs a resolvable price at both ends of the
// window, which a same-week purchase never has) -- the biggest position by
// today's value instead of by change.
async function pickLargestHoldingDriver(
  items: PortfolioItem[],
  series: Series,
  todayKey: string
): Promise<PulseDriver | null> {
  let best: { item: PortfolioItem; value: number } | null = null;
  for (const item of items) {
    const value = itemValueAt(item, series, todayKey);
    if (value == null) continue;
    if (!best || value > best.value) best = { item, value };
  }
  if (!best) return null;
  const { item } = best;

  if (item.cardId) {
    const card = await prisma.card.findUnique({
      where: { id: item.cardId },
      select: { name: true, imageUrl: true, set: { select: { name: true } } },
    });
    if (!card) return null;
    return {
      itemType: "card",
      itemId: item.cardId,
      name: card.name,
      setName: card.set?.name ?? null,
      imageUrl: card.imageUrl,
      changeAbs: 0,
      changePct: 0,
    };
  }
  if (item.sealedProductId) {
    const sealed = await prisma.sealedProduct.findUnique({
      where: { id: item.sealedProductId },
      select: { name: true, imageUrl: true, set: { select: { name: true } } },
    });
    if (!sealed) return null;
    return {
      itemType: "sealed",
      itemId: item.sealedProductId,
      name: sealed.name,
      setName: sealed.set?.name ?? null,
      imageUrl: sealed.imageUrl,
      changeAbs: 0,
      changePct: 0,
    };
  }
  return null;
}

// The dashboard hero's data source: a 1-3 sentence, rule-based (never LLM)
// read of "what changed this week", plus the art of whichever holding the
// story is actually about. Consumes buildPortfolioSeries/getPortfolioData --
// both React-cache()'d per request -- rather than re-querying PriceSnapshot,
// which is already the most expensive query on the page.
export async function getDashboardPulse(userId: string): Promise<DashboardPulse> {
  const { items, cardSeries, sealedSeries, sortedDates } = await buildPortfolioSeries(userId);
  const series: Series = { cardSeries, sealedSeries };
  const todayKey = sortedDates[sortedDates.length - 1];

  if (!todayKey) {
    return {
      status: "no-history",
      windowLabel: "This week",
      windowCaption: "",
      totalValue: 0,
      netChange: { abs: 0, pct: 0 },
      facts: [],
      driver: null,
      sparkline: [],
    };
  }

  // getPortfolioData re-derives its own PortfolioSeries, but it's the exact
  // same cached call -- reusing its `history` here (instead of re-deriving
  // portfolio value with separate code) is what guarantees the hero total
  // never drifts from the "Total value" tile or the value-vs-cost chart's
  // last point (PORT-13).
  const { history } = await getPortfolioData(userId);
  const totalValue = history[history.length - 1]?.price ?? 0;

  const earliestKey = sortedDates[0];
  const cutoffKey = toDateKey(new Date(parseLocalDate(todayKey).getTime() - WINDOW_DAYS * DAY_MS));
  const windowStartKey = earliestKey > cutoffKey ? earliestKey : cutoffKey;
  const windowPoints = history.filter((p) => p.date >= windowStartKey);
  const status: DashboardPulse["status"] = windowPoints.length < 2 ? "thin-history" : "full";

  if (status === "thin-history") {
    const costBasis = items.reduce((sum, i) => sum + (i.costPerUnit ?? 0) * i.quantity, 0);
    const n = items.length;
    const driver = await pickLargestHoldingDriver(items, series, todayKey);
    return {
      status,
      windowLabel: "Since you started",
      windowCaption: windowPoints.length <= 1 ? "Today" : `${windowPoints.length} days of history`,
      totalValue,
      netChange: { abs: 0, pct: 0 },
      facts: [
        {
          kind: "onboarding",
          tone: "neutral",
          text: `Portfolio started · ${n} item${n === 1 ? "" : "s"} · ${money.format(costBasis)} invested. Price history builds daily — check back tomorrow.`,
        },
      ],
      driver,
      sparkline: windowPoints,
    };
  }

  // Same shared delta helper every StatTile uses, just at a 7-day window
  // instead of 30 -- keeps this consistent with the rest of the page rather
  // than inventing a second "how much did this change" formula.
  const netChange = deltaOverDays(history, WINDOW_DAYS);
  const flat = isFlatChange(netChange.abs, netChange.pct);
  const netTone: NarrativeFact["tone"] = flat ? "neutral" : netChange.abs > 0 ? "positive" : "negative";

  const facts: NarrativeFact[] = [
    {
      kind: "net-change",
      tone: netTone,
      text: flat
        ? `Holding steady this week at ${money.format(totalValue)}.`
        : netChange.abs > 0
          ? `Up ${money.format(netChange.abs)} this week, ${pctFmt.format(Math.abs(netChange.pct))} to ${money.format(totalValue)}.`
          : `Down ${money.format(Math.abs(netChange.abs))} this week, ${pctFmt.format(Math.abs(netChange.pct))} to ${money.format(totalValue)}.`,
    },
  ];

  if (!flat) {
    function segmentValueAt(dateKey: string, wantCard: boolean): number {
      let total = 0;
      for (const item of items) {
        if (wantCard ? !item.cardId : !item.sealedProductId) continue;
        total += itemValueAt(item, series, dateKey) ?? 0;
      }
      return total;
    }
    const cardHistory: PricePoint[] = sortedDates.map((d) => ({ date: d, price: segmentValueAt(d, true) }));
    const sealedHistory: PricePoint[] = sortedDates.map((d) => ({ date: d, price: segmentValueAt(d, false) }));
    const cardDelta = deltaOverDays(cardHistory, WINDOW_DAYS);
    const sealedDelta = deltaOverDays(sealedHistory, WINDOW_DAYS);
    const shares = computeSegmentShare(cardDelta.abs, sealedDelta.abs);
    const netSign = Math.sign(netChange.abs);
    if (shares && shares.cardShare >= 0.6 && Math.sign(cardDelta.abs) === netSign) {
      facts.push({ kind: "driver-segment", tone: netTone, text: `Cards drove ${pctFmt.format(shares.cardShare)} of the move.` });
    } else if (shares && shares.sealedShare >= 0.6 && Math.sign(sealedDelta.abs) === netSign) {
      facts.push({ kind: "driver-segment", tone: netTone, text: `Sealed drove ${pctFmt.format(shares.sealedShare)} of the move.` });
    }
  }

  const movers = await computeMovers(userId, WINDOW_DAYS);
  let driver: PulseDriver | null;
  if (movers.length > 0) {
    const top = movers.reduce((a, b) => (Math.abs(b.changeAbs) > Math.abs(a.changeAbs) ? b : a));
    driver = {
      itemType: top.itemType,
      itemId: top.itemId,
      name: top.name,
      setName: top.setName,
      imageUrl: top.imageUrl,
      changeAbs: top.changeAbs,
      changePct: top.changePct,
    };
    if (!flat) {
      facts.push({
        kind: "top-mover",
        tone: top.changeAbs >= 0 ? "positive" : "negative",
        text:
          top.changeAbs >= 0
            ? `${top.name} led, ${signedMoney(top.changeAbs)} (${signedPct(top.changePct)}).`
            : `${top.name} dragged hardest, ${signedMoney(top.changeAbs)} (${signedPct(top.changePct)}).`,
      });
    }
  } else {
    driver = await pickLargestHoldingDriver(items, series, todayKey);
  }

  const windowStartValue = totalValue - netChange.abs;
  const milestoneText = pickMilestoneFact(history, windowStartKey, totalValue, windowStartValue, netChange.abs);
  if (milestoneText) {
    facts.push({ kind: "milestone", tone: "positive", text: milestoneText });
  }

  return {
    status,
    windowLabel: "This week",
    windowCaption: formatWindowCaption(windowStartKey, todayKey),
    totalValue,
    netChange,
    facts: facts.slice(0, 3),
    driver,
    sparkline: windowPoints,
  };
}
