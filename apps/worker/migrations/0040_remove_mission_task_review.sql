UPDATE mission_tasks
SET status = 'backlog',
    column_id = COALESCE(
      (
        SELECT c.id
        FROM mission_project_columns c
        WHERE c.project_id = mission_tasks.project_id
          AND c.user_id = mission_tasks.user_id
          AND c.status = 'backlog'
          AND c.archived_at IS NULL
        ORDER BY c.position ASC, c.id ASC
        LIMIT 1
      ),
      CASE
        WHEN project_id IS NOT NULL THEN project_id || ':backlog'
        ELSE NULL
      END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'review';

DELETE FROM mission_project_columns
WHERE status = 'review';

UPDATE mission_project_columns
SET position = 2,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'done';
