"use client";

import { useState, useTransition } from "react";
import { DialogShell } from "@/components/DialogShell";
import { reportUser, type ReportReasonValue } from "@/app/actions/friends";

const REASONS: { value: ReportReasonValue; label: string }[] = [
  { value: "INAPPROPRIATE_NAME", label: "Inappropriate name" },
  { value: "SCAM_OR_UNFAIR_TRADE", label: "Scam or unfair trade" },
  { value: "HARASSMENT_OR_SPAM", label: "Harassment or spam" },
  { value: "OTHER", label: "Something else" },
];

// "Also block" defaults on -- someone reporting an account almost always
// wants it gone from their list too, and they can untick it if not.
export function ReportUserDialog({
  userId,
  displayName,
  onClose,
  onDone,
}: {
  userId: string;
  displayName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ReportReasonValue | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await reportUser({ userId, reason, details, alsoBlock });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <DialogShell title="Thanks for letting us know" onClose={onDone}>
        <p className="font-body text-sm text-ink-muted">
          We&apos;ll review this report.{alsoBlock ? ` ${displayName} is blocked and can't add you or trade with you.` : ""}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-4 w-full rounded-full bg-emerald px-4 py-2.5 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90"
        >
          Done
        </button>
      </DialogShell>
    );
  }

  return (
    <DialogShell title="Report" subtitle={displayName} onClose={onClose}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-body text-sm text-ink-muted">What&apos;s wrong?</legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-card border px-3 font-body text-sm text-ink transition-colors ${
              reason === r.value ? "border-emerald bg-paper-raised" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="report-reason"
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="accent-emerald"
            />
            {r.label}
          </label>
        ))}
      </fieldset>

      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={reason === "OTHER" ? "Tell us what happened" : "Anything else we should know? (optional)"}
        className="mt-3 w-full resize-none rounded-card border border-line bg-paper px-3 py-2 font-body text-sm text-ink outline-none focus:border-emerald"
      />

      <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 font-body text-sm text-ink">
        <input
          type="checkbox"
          checked={alsoBlock}
          onChange={(e) => setAlsoBlock(e.target.checked)}
          className="size-4 accent-emerald"
        />
        Also block {displayName}
      </label>

      {error && <p className="mt-1 font-body text-xs text-amber">{error}</p>}

      <button
        type="button"
        disabled={pending || !reason}
        onClick={handleSubmit}
        className="mt-4 w-full rounded-full bg-emerald px-4 py-2.5 font-body text-sm font-medium text-paper-raised transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send report"}
      </button>
    </DialogShell>
  );
}
