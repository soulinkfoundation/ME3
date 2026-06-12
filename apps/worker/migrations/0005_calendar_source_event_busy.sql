-- Preserve Google Calendar free/transparent events for display without blocking scheduling.

ALTER TABLE calendar_source_events ADD COLUMN is_busy INTEGER NOT NULL DEFAULT 1;
