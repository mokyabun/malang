WITH numbered_general_chats AS (
    SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY created_at, id) AS chat_number
    FROM conversations
    WHERE character_id = '00000000-0000-4000-8000-000000000001'
)
UPDATE conversations
SET title = 'Chat ' || (
    SELECT chat_number
    FROM numbered_general_chats
    WHERE numbered_general_chats.id = conversations.id
)
WHERE character_id = '00000000-0000-4000-8000-000000000001'
  AND title = 'Chat';
