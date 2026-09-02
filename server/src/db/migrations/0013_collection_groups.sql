CREATE TABLE character_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE characters ADD COLUMN group_id TEXT REFERENCES character_groups(id) ON DELETE SET NULL;
ALTER TABLE characters ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE characters
SET sort_order = (
    SELECT COUNT(*)
    FROM characters AS newer
    WHERE newer.updated_at > characters.updated_at
       OR (newer.updated_at = characters.updated_at AND newer.id < characters.id)
);

CREATE INDEX characters_group_order_idx ON characters(group_id, sort_order);

CREATE TABLE conversation_groups (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE conversations ADD COLUMN group_id TEXT REFERENCES conversation_groups(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE conversations
SET sort_order = (
    SELECT COUNT(*)
    FROM conversations AS newer
    WHERE newer.character_id = conversations.character_id
      AND (
          newer.updated_at > conversations.updated_at
          OR (newer.updated_at = conversations.updated_at AND newer.id < conversations.id)
      )
);

CREATE INDEX conversation_groups_character_order_idx
    ON conversation_groups(character_id, sort_order);
CREATE INDEX conversations_group_order_idx ON conversations(character_id, group_id, sort_order);
