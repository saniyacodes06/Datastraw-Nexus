import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

// Signed-in app: collapsible sidebar. The shell reads the session cookie, so it streams in behind Suspense.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}><AppShell>{children}</AppShell></Suspense>;
}
