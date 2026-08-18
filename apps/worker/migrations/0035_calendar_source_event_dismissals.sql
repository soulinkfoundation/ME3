CREATE TABLE calendar_source_event_dismissals (
  source_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source_id, external_key),
  FOREIGN KEY (source_id) REFERENCES calendar_sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_calendar_source_event_dismissals_source
  ON calendar_source_event_dismissals(source_id);
