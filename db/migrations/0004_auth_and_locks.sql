ALTER TABLE "employees" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "leaves_one_active_per_day" ON "leaves" USING btree ("employee_id","date") WHERE status in ('PENDING', 'APPROVED');--> statement-breakpoint
CREATE UNIQUE INDEX "rosters_one_published" ON "rosters" USING btree ("year","month") WHERE status = 'PUBLISHED';