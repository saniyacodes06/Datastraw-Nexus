"use client";
// Shows the one-time message an action left in the flash cookie, then clears the cookie.
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function Flash({ value }: { value?: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => { document.cookie = "nexus_flash=; Max-Age=0; path=/"; }, [value]);
  if (!value || !shown) return null;
  const message = value.slice(value.indexOf("|") + 1);
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <span className="flex-1">{message}</span>
      <button onClick={() => setShown(false)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
    </div>
  );
}
