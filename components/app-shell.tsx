// Signed in: collapsible sidebar + page. Signed out (landing, login): the page alone, full width.
import { Suspense, type ReactNode } from "react";
import { cookies } from "next/headers";
import { Flash } from "@/components/flash";
import { SideNav } from "@/components/side-nav";
import { FLASH } from "@/lib/action";
import { getSession } from "@/lib/auth";
import { getInbox } from "@/lib/inbox";

export async function FlashSlot() {
  const value = (await cookies()).get(FLASH)?.value;
  return <Flash key={value} value={value} />;
}

export async function AppShell({ children }: { children: ReactNode }) {
  const s = await getSession();
  const flash = <Suspense fallback={null}><FlashSlot /></Suspense>;
  if (!s) return <main className="min-h-full p-4">{flash}{children}</main>; // pages redirect to /login anyway
  const [{ unread }, jar] = await Promise.all([getInbox(s), cookies()]);
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <SideNav manager={s.role === "MANAGER"} unread={unread} name={s.name} initialCollapsed={jar.get("nexus_sidebar")?.value === "collapsed"} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{flash}{children}</main>
    </div>
  );
}
