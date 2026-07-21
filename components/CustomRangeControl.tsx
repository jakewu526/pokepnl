"use client";

import { type ChangeEvent, type FormEvent, type KeyboardEvent, useMemo, useRef, useState } from "react";
import { formatTypedDate, parseTypedDate, resolveCustomRange, toDateKey } from "@/lib/chart-format";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="13"
        height="11"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4.5" y1="1.5" x2="4.5" y2="4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="11.5" y1="1.5" x2="11.5" y2="4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// A digit-only month segment auto-advances once it can't take another digit
// without exceeding 12 (so typing "9" jumps immediately, but "1" waits for a
// possible second digit like "10"/"11"/"12").
function isMonthSegmentFull(digits: string): boolean {
  return digits.length === 2 || (digits.length === 1 && Number(digits) > 1);
}

// Same idea for day (max 31): a leading 4-9 can't extend to a valid two-digit day.
function isDaySegmentFull(digits: string): boolean {
  return digits.length === 2 || (digits.length === 1 && Number(digits) > 3);
}

function onlyDigits(text: string, maxLength: number): string {
  return text.replace(/\D/g, "").slice(0, maxLength);
}

// Three digit-only boxes (MM-DD-YYYY) instead of one freeform field, so a
// typed month/day jumps to the next box automatically and stray characters
// can't be entered. A real (but invisible) <input type="date"> still sits
// over the calendar icon so clicking it opens the native picker as before;
// picking a date there fills the three boxes.
function DateField({
  label,
  value,
  onChange,
  maxKey,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  maxKey: string;
}) {
  const [month = "", day = "", year = ""] = value.split("/");
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const pickerValue = parseTypedDate(`${month}/${day}/${year}`) ?? "";

  function handleMonthChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = onlyDigits(e.target.value, 2);
    onChange(`${digits}/${day}/${year}`);
    if (isMonthSegmentFull(digits)) {
      dayRef.current?.focus();
      dayRef.current?.select();
    }
  }

  function handleDayChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = onlyDigits(e.target.value, 2);
    onChange(`${month}/${digits}/${year}`);
    if (isDaySegmentFull(digits)) {
      yearRef.current?.focus();
      yearRef.current?.select();
    }
  }

  function handleYearChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = onlyDigits(e.target.value, 4);
    onChange(`${month}/${day}/${digits}`);
  }

  function handleDayKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && day === "") monthRef.current?.focus();
  }

  function handleYearKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && year === "") dayRef.current?.focus();
  }

  return (
    <span className="relative inline-flex items-center gap-1 rounded border border-line bg-paper py-1 pl-2 pr-6">
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={month}
        onChange={handleMonthChange}
        aria-label={`${label} month`}
        className="w-[2ch] bg-transparent text-center font-data text-xs text-ink outline-none"
      />
      <span className="text-ink-muted">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        value={day}
        onChange={handleDayChange}
        onKeyDown={handleDayKeyDown}
        aria-label={`${label} day`}
        className="w-[2ch] bg-transparent text-center font-data text-xs text-ink outline-none"
      />
      <span className="text-ink-muted">-</span>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        value={year}
        onChange={handleYearChange}
        onKeyDown={handleYearKeyDown}
        aria-label={`${label} year`}
        className="w-[4ch] bg-transparent text-center font-data text-xs text-ink outline-none"
      />
      <span className="pointer-events-none absolute right-1.5 text-ink-muted">
        <CalendarIcon />
      </span>
      <input
        type="date"
        max={maxKey}
        value={pickerValue}
        onChange={(e) => onChange(e.target.value ? formatTypedDate(e.target.value) : "")}
        aria-label={`Pick ${label.toLowerCase()}`}
        className="absolute right-0 h-full w-6 cursor-pointer opacity-0"
      />
    </span>
  );
}

export function CustomRangeControl({
  isActive,
  onApply,
}: {
  isActive: boolean;
  onApply: (range: { start: string; end: string }) => void;
}) {
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = resolveCustomRange(startText, endText, todayKey);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onApply(result);
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-center gap-1.5">
        <DateField
          label="Custom range start date"
          value={startText}
          onChange={setStartText}
          maxKey={todayKey}
        />
        <span className="font-body text-xs text-ink-muted">–</span>
        <DateField
          label="Custom range end date"
          value={endText}
          onChange={setEndText}
          maxKey={todayKey}
        />
        <button
          type="submit"
          className={`rounded px-2.5 py-1 font-body text-xs font-medium transition ${
            isActive
              ? "bg-ink text-paper"
              : "border border-line text-ink-muted hover:bg-paper hover:text-ink"
          }`}
        >
          Apply
        </button>
      </form>
      {error && <p className="mt-1.5 basis-full font-body text-xs text-amber">{error}</p>}
    </>
  );
}
