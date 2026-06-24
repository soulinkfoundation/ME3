CREATE TABLE ai_model_defaults_new (
  user_id TEXT NOT NULL,
  use_case TEXT NOT NULL CHECK (use_case IN ('default', 'chat', 'reasoning', 'extraction', 'image_generation')),
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, use_case),
  FOREIGN KEY (user_id) REFERENCES owner_profile(id) ON DELETE CASCADE
);

INSERT INTO ai_model_defaults_new (
  user_id, use_case, provider_id, model, created_at, updated_at
)
SELECT user_id, use_case, provider_id, model, created_at, updated_at
FROM ai_model_defaults;

DROP TABLE ai_model_defaults;
ALTER TABLE ai_model_defaults_new RENAME TO ai_model_defaults;
