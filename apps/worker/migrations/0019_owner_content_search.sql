CREATE VIRTUAL TABLE owner_content_search USING fts5(
  user_id UNINDEXED,
  source_type UNINDEXED,
  source_id UNINDEXED,
  title,
  body,
  project_id UNINDEXED,
  project_name,
  status UNINDEXED,
  source_date UNINDEXED,
  updated_at UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE TRIGGER owner_content_search_journal_insert
AFTER INSERT ON journal_entries
WHEN NEW.archived_at IS NULL
BEGIN
  INSERT INTO owner_content_search (
    user_id, source_type, source_id, title, body, project_id,
    project_name, status, source_date, updated_at
  ) VALUES (
    NEW.user_id,
    'journal',
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.title), ''), 'Journal entry for ' || NEW.entry_date),
    NEW.body,
    NULL,
    '',
    NULL,
    NEW.entry_date,
    NEW.updated_at
  );
END;

CREATE TRIGGER owner_content_search_journal_update
AFTER UPDATE ON journal_entries
BEGIN
  DELETE FROM owner_content_search
  WHERE user_id = OLD.user_id AND source_type = 'journal' AND source_id = OLD.id;

  INSERT INTO owner_content_search (
    user_id, source_type, source_id, title, body, project_id,
    project_name, status, source_date, updated_at
  )
  SELECT
    NEW.user_id,
    'journal',
    NEW.id,
    COALESCE(NULLIF(TRIM(NEW.title), ''), 'Journal entry for ' || NEW.entry_date),
    NEW.body,
    NULL,
    '',
    NULL,
    NEW.entry_date,
    NEW.updated_at
  WHERE NEW.archived_at IS NULL;
END;

CREATE TRIGGER owner_content_search_journal_delete
AFTER DELETE ON journal_entries
BEGIN
  DELETE FROM owner_content_search
  WHERE user_id = OLD.user_id AND source_type = 'journal' AND source_id = OLD.id;
END;

CREATE TRIGGER owner_content_search_task_insert
AFTER INSERT ON mission_tasks
WHEN NEW.archived_at IS NULL
BEGIN
  INSERT INTO owner_content_search (
    user_id, source_type, source_id, title, body, project_id,
    project_name, status, source_date, updated_at
  ) VALUES (
    NEW.user_id,
    'mission_task',
    NEW.id,
    NEW.title,
    COALESCE(NEW.description, ''),
    NEW.project_id,
    COALESCE((
      SELECT name FROM mission_projects
      WHERE id = NEW.project_id AND user_id = NEW.user_id
      LIMIT 1
    ), ''),
    NEW.status,
    NEW.due_at,
    NEW.updated_at
  );
END;

CREATE TRIGGER owner_content_search_task_update
AFTER UPDATE ON mission_tasks
BEGIN
  DELETE FROM owner_content_search
  WHERE user_id = OLD.user_id AND source_type = 'mission_task' AND source_id = OLD.id;

  INSERT INTO owner_content_search (
    user_id, source_type, source_id, title, body, project_id,
    project_name, status, source_date, updated_at
  )
  SELECT
    NEW.user_id,
    'mission_task',
    NEW.id,
    NEW.title,
    COALESCE(NEW.description, ''),
    NEW.project_id,
    COALESCE((
      SELECT name FROM mission_projects
      WHERE id = NEW.project_id AND user_id = NEW.user_id
      LIMIT 1
    ), ''),
    NEW.status,
    NEW.due_at,
    NEW.updated_at
  WHERE NEW.archived_at IS NULL;
END;

CREATE TRIGGER owner_content_search_task_delete
AFTER DELETE ON mission_tasks
BEGIN
  DELETE FROM owner_content_search
  WHERE user_id = OLD.user_id AND source_type = 'mission_task' AND source_id = OLD.id;
END;

CREATE TRIGGER owner_content_search_project_rename
AFTER UPDATE OF name ON mission_projects
BEGIN
  UPDATE owner_content_search
  SET project_name = NEW.name
  WHERE user_id = NEW.user_id
    AND source_type = 'mission_task'
    AND project_id = NEW.id;
END;

INSERT INTO owner_content_search (
  user_id, source_type, source_id, title, body, project_id,
  project_name, status, source_date, updated_at
)
SELECT
  user_id,
  'journal',
  id,
  COALESCE(NULLIF(TRIM(title), ''), 'Journal entry for ' || entry_date),
  body,
  NULL,
  '',
  NULL,
  entry_date,
  updated_at
FROM journal_entries
WHERE archived_at IS NULL;

INSERT INTO owner_content_search (
  user_id, source_type, source_id, title, body, project_id,
  project_name, status, source_date, updated_at
)
SELECT
  t.user_id,
  'mission_task',
  t.id,
  t.title,
  COALESCE(t.description, ''),
  t.project_id,
  COALESCE(p.name, ''),
  t.status,
  t.due_at,
  t.updated_at
FROM mission_tasks t
LEFT JOIN mission_projects p ON p.id = t.project_id AND p.user_id = t.user_id
WHERE t.archived_at IS NULL;
