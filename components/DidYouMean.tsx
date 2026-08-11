import Link from "next/link";

export function DidYouMean({ href, suggestion }: { href: string; suggestion: string }) {
  return (
    <p className="font-body text-sm text-ink-muted">
      Did you mean{" "}
      <Link href={href} className="font-medium text-emerald-strong hover:underline">
        “{suggestion}”
      </Link>
      ?
    </p>
  );
}
