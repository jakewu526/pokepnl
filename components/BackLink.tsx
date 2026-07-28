"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function BackLink({
  fallbackHref,
  children,
  className,
}: {
  fallbackHref: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
