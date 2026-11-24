// Notifications for the signed-in person + how many are unseen.
import { desc, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, notifications } from "@/db";
import type { Session } from "./auth";

export async function getInbox(s: Session, limit = 50) {
  const audiences = ["ALL", s.role === "MANAGER" ? "MANAGER" : s.employeeId ?? ""];
  const rows = await db.select().from(notifications).where(inArray(notifications.audience, audiences))
    .orderBy(desc(notifications.createdAt)).limit(limit);
  const seen = new Date((await cookies()).get("nexus_seen")?.value ?? 0);
  return { rows, unread: rows.filter((n) => n.createdAt > seen).length, seen };
}
