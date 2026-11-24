import Link from "next/link";
import { markNotificationsSeen } from "@/app/actions";
import { SubmitButton } from "@/components/form";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getInbox } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export default async function NotificationsPage() {
  const s = await requireSession();
  const { rows, unread, seen } = await getInbox(s);
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{unread} new</p>
        </div>
        {unread > 0 && <form action={markNotificationsSeen}><SubmitButton variant="outline" size="sm" pending="…">Mark all as seen</SubmitButton></form>}
      </div>
      <Card><CardContent className="divide-y py-2">
        {rows.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nothing yet. Roster publishes, changes and leave decisions show up here.</p>}
        {rows.map((n) => (
          <div key={n.id} className={cn("flex items-start gap-3 py-2 text-sm", n.createdAt > seen && "font-medium")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.createdAt > seen ? "bg-red-600" : "bg-transparent")} />
            <div className="flex-1">{n.link ? <Link href={n.link} className="hover:underline">{n.message}</Link> : n.message}</div>
            <time className="shrink-0 text-xs font-normal text-muted-foreground">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</time>
          </div>
        ))}
      </CardContent></Card>
    </div>
  );
}
