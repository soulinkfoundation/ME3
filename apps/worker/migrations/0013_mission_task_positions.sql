ALTER TABLE mission_tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE mission_tasks
SET position = (
  SELECT ordered.position
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, project_id, status
        ORDER BY priority ASC, COALESCE(due_at, scheduled_for, created_at) ASC, id ASC
      ) * 1000 AS position
    FROM mission_tasks
  ) ordered
  WHERE ordered.id = mission_tasks.id
);
