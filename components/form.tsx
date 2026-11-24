"use client";
// Small form building blocks reused by every page.
import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Button that shows a busy label while its form's server action runs. */
export function SubmitButton({ children, pending = "Working…", ...props }: ComponentProps<typeof Button> & { pending?: string }) {
  const { pending: busy } = useFormStatus();
  return <Button type="submit" disabled={busy || props.disabled} {...props}>{busy ? pending : children}</Button>;
}

export const selectClass = "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Native select, styled like shadcn inputs. `auto` submits the form on change (for view pickers). */
export function Select({ auto, className, ...props }: ComponentProps<"select"> & { auto?: boolean }) {
  return <select {...props} className={cn(selectClass, className)} onChange={auto ? (e) => e.currentTarget.form?.requestSubmit() : props.onChange} />;
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
