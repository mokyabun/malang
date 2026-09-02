WITH numbered_conversations AS (
    SELECT
        conversations.id,
        conversations.title,
        characters.name AS character_name,
        ROW_NUMBER() OVER (
            PARTITION BY conversations.character_id
            ORDER BY conversations.created_at, conversations.id
        ) AS chat_number
    FROM conversations
    INNER JOIN characters ON characters.id = conversations.character_id
)
UPDATE conversations
SET title = 'Chat ' || (
    SELECT chat_number
    FROM numbered_conversations
    WHERE numbered_conversations.id = conversations.id
)
WHERE id IN (
    SELECT id
    FROM numbered_conversations
    WHERE title = character_name
);
