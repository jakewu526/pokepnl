"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MobileTabBar } from "@/components/MobileTabBar";
import { QuickActionOverlay } from "@/components/QuickActionOverlay";
import { FloatingBinderBar } from "@/components/FloatingBinderBar";

// Owns the green-button overlay's open state so the button, the floating
// Binder/avatar replica, and the overlay itself are all siblings in one
// client tree -- UserMenuButton is an async *server* component, so it can't
// be conditionally mounted from client state, hence FloatingBinderBar
// re-draws its own plain avatar markup instead of reusing it.
export function AppChrome({ isAuthed, hasNotification }: { isAuthed: boolean; hasNotification: boolean }) {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);

  function handlePrimaryAction() {
    if (!isAuthed) {
      router.push("/login");
      return;
    }
    setOverlayOpen(true);
  }

  return (
    <>
      <MobileTabBar onPrimaryAction={handlePrimaryAction} />
      {overlayOpen && (
        <>
          <FloatingBinderBar hasAvatar={isAuthed} hasNotification={hasNotification} />
          <QuickActionOverlay onClose={() => setOverlayOpen(false)} />
        </>
      )}
    </>
  );
}
