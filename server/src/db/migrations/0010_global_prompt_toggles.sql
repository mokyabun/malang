ALTER TABLE app_settings
ADD COLUMN prompt_toggle_values_json TEXT NOT NULL DEFAULT '{}';

-- Preserve the latest value recorded for every legacy conversation-scoped toggle key.
WITH ranked_toggle_values AS (
    SELECT
        toggle.key AS key,
        CAST(toggle.value AS TEXT) AS value,
        ROW_NUMBER() OVER (
            PARTITION BY toggle.key
            ORDER BY conversations.updated_at DESC, conversations.id DESC
        ) AS recency
    FROM conversations,
        json_each(
            CASE
                WHEN json_valid(conversations.toggles_json) THEN conversations.toggles_json
                ELSE '{}'
            END
        ) AS toggle
)
UPDATE app_settings
SET prompt_toggle_values_json = COALESCE((
    SELECT json_group_object(key, value)
    FROM ranked_toggle_values
    WHERE recency = 1
), '{}')
WHERE id = 1;
