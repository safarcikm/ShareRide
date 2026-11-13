-- Extensions the app relies on (ADR 0005). Creating them first means a host
-- that lacks one fails at the first deploy, not months later.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
