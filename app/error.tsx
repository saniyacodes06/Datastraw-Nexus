"use client";
import { Button } from "@/components/ui/button";

// Any failed action or query lands here with its message, instead of a blank page.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="font-semibold text-destructive">Something went wrong</h2>
      <p className="text-sm">{error.message}</p>
      <p className="text-xs text-muted-foreground">If this mentions the engine, make sure it is running (npm run engine).</p>
      <Button variant="outline" onClick={reset}>Try again</Button>
    </div>
  );
}
