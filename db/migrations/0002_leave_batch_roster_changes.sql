ALTER TABLE "leaves" ADD COLUMN "batch" text;--> statement-breakpoint
ALTER TABLE "rosters" ADD COLUMN "changes" jsonb DEFAULT '[]'::jsonb NOT NULL;