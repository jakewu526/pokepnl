export function EnvBadge() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== "uat") return null;

  return (
    <span className="rounded-full bg-amber-tint px-2 py-0.5 font-body text-[11px] font-medium text-amber">
      UAT
    </span>
  );
}
