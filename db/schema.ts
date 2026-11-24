// Database tables. Text ids (E05, bloombotanics-cs) keep data readable and match the engine.
import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgTable, serial, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const pods = pgTable("pods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  leadId: text("lead_id"),
});

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  podId: text("pod_id").references(() => pods.id),
  role: text("role").notNull().default("Executive"), // Executive | Pod Lead
  preferredOff: integer("preferred_off"), // 0=Mon .. 6=Sun, null = no preference
  maxConsecutive: integer("max_consecutive").notNull().default(6),
  maxBackup: integer("max_backup").notNull().default(1), // extra brands they can back up per day
  active: boolean("active").notNull().default(true),
  passwordHash: text("password_hash"), // scrypt "salt:hash"; null = cannot sign in until a password is set
});

export const brands = pgTable("brands", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  podId: text("pod_id").references(() => pods.id),
});

export const brandProcesses = pgTable("brand_processes", {
  id: text("id").primaryKey(),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  process: text("process").notNull(), // CS | ACC | NDR | RET | anything new
  calendar: text("calendar").notNull(), // 365_DAYS | NO_PUBLIC_HOLIDAYS | NO_SUN_NO_PH
  minStaff: integer("min_staff").notNull().default(1),
  minByWeekday: jsonb("min_by_weekday").$type<Record<string, number>>().notNull().default({}),
});

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  bpId: text("bp_id").notNull().references(() => brandProcesses.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("PRIMARY"), // PRIMARY | BACKUP
}, (t) => [unique().on(t.employeeId, t.bpId)]);

export const holidays = pgTable("holidays", {
  date: date("date").primaryKey(),
  name: text("name").notNull(),
});

export const leaves = pgTable("leaves", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull().default("LEAVE"), // LEAVE | COMP_OFF
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  reason: text("reason"),
  batch: text("batch"), // days asked together share one batch id
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // The database, not app code, stops the same day being requested twice (double-click, two tabs).
  uniqueIndex("leaves_one_active_per_day").on(t.employeeId, t.date).where(sql`status in ('PENDING', 'APPROVED')`),
]);

// One row per saved roster version. The grid itself is JSON straight from the engine.
export const rosters = pgTable("rosters", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("DRAFT"), // DRAFT | PUBLISHED
  data: jsonb("data").notNull(), // engine roster: days, entries, comp_offs_earned...
  issues: jsonb("issues").notNull().default([]),
  coverage: jsonb("coverage").notNull().default({}), // bp -> per day [have, need]
  changes: jsonb("changes").notNull().default([]), // cells changed vs previous version
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique().on(t.year, t.month, t.version), // two saves at once can't both become "v4"
  uniqueIndex("rosters_one_published").on(t.year, t.month).where(sql`status = 'PUBLISHED'`), // two publishes at once can't both win
]);

// In-app notifications. audience: "ALL" | "MANAGER" | an employee id.
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  audience: text("audience").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Who did what, when (manager actions + assistant actions).
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(), // "Manager" | employee name | "Assistant (for Manager)"
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
