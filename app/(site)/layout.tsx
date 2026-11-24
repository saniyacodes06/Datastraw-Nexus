import { Suspense } from "react";
import { FlashSlot } from "@/components/app-shell";

// Public pages (landing, login): full width, no sidebar. Still shows action messages (e.g. wrong password).
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-full">
      <Suspense fallback={null}><div className="mx-auto max-w-xl px-4 pt-4 empty:hidden"><FlashSlot /></div></Suspense>
      {children}
    </main>
  );
}
