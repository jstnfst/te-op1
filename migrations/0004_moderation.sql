-- moderation: banned accounts can't sign in, and existing sessions are
-- rejected by the API middleware (functions/api/_middleware.ts).
ALTER TABLE users ADD COLUMN banned_at TEXT;
