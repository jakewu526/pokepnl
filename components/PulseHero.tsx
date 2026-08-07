"use client";

import Image from "next/image";
import Link from "next/link";
import { HoloSurface } from "@/components/HoloSurface";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/Sparkline";
import type { DashboardPulse } from "@/lib/narrative";

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function signedPrice(value: number): string {
  const formatted = priceFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

function signedPercent(value: number): string {
  const formatted = percentFormatter.format(Math.abs(value));
  return value < 0 ? `-${formatted}` : `+${formatted}`;
}

// "What changed since I last looked" -- the dashboard's hero. `driver` (the
// holding the narrative is actually about) supplies the background art, so
// the image and the words never disagree; when there's no driver (empty
// series, or every holding untouched this window) the hero still renders on
// a plain surface with the holo sheen intact.
export function PulseHero({ pulse }: { pulse: DashboardPulse }) {
  const { driver, status, windowLabel, windowCaption, totalValue, netChange, facts, sparkline } = pulse;

  const changeTone: "positive" | "negative" | "neutral" =
    netChange.abs > 0 ? "positive" : netChange.abs < 0 ? "negative" : "neutral";
  const showDelta = status === "full" && netChange.abs !== 0;
  const showSparkline = status === "full" && sparkline.length >= 2;
  const driverHref = driver ? (driver.itemType === "card" ? `/cards/${driver.itemId}` : `/sealed/${driver.itemId}`) : null;

  return (
    <HoloSurface className="relative overflow-hidden rounded-card border border-line bg-paper-raised">
      {driver?.imageUrl && (
        <Image
          src={driver.imageUrl}
          alt=""
          fill
          sizes="100vw"
          priority
          aria-hidden="true"
          className="scale-110 object-cover blur-2xl opacity-25 dark:opacity-40"
        />
      )}
      {/* Mandatory scrim -- the only thing guaranteeing text contrast over
          arbitrary card art, light or dark, holo or not. */}
      <div className="absolute inset-0 bg-gradient-to-br from-paper via-paper/85 to-paper/55" />

      <div className="relative z-[2] grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
        <div className="rise-in flex flex-col gap-3">
          <p className="font-body text-xs text-ink-muted">
            {windowLabel}
            {windowCaption && <span> · {windowCaption}</span>}
          </p>

          <p className="font-data text-5xl font-medium text-ink sm:text-6xl">
            <AnimatedNumber value={totalValue} format="currency" />
          </p>

          {showDelta && (
            <p className={`font-data text-sm font-medium ${changeTone === "positive" ? "text-emerald-strong" : "text-amber"}`}>
              {changeTone === "positive" ? "▲" : "▼"} {signedPrice(netChange.abs)} · {signedPercent(netChange.pct)}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {facts.map((fact, i) => (
              <p key={i} className="font-body text-base text-ink sm:text-lg">
                {fact.text}
              </p>
            ))}
          </div>

          {showSparkline && (
            <Sparkline points={sparkline} tone={changeTone} className="mt-1 h-8 w-32" />
          )}
        </div>

        {driver && driverHref && (
          <Link
            href={driverHref}
            className="rise-in hidden flex-col items-center gap-2 sm:flex"
            style={{ animationDelay: "80ms" }}
          >
            <div className="relative aspect-[5/7] w-[140px] overflow-hidden rounded-card ring-1 ring-line">
              {driver.imageUrl ? (
                <Image
                  src={driver.imageUrl}
                  alt={driver.name}
                  fill
                  sizes="140px"
                  className="bg-paper-raised object-contain p-2"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-line/40 text-xs text-ink-muted">No image</div>
              )}
            </div>
            <p className="max-w-[140px] truncate text-center font-body text-xs font-medium text-ink">{driver.name}</p>
          </Link>
        )}
      </div>
    </HoloSurface>
  );
}
