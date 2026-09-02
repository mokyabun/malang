CREATE TABLE conversation_memory_settings (
    conversation_id TEXT PRIMARY KEY NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    settings_json TEXT NOT NULL,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

CREATE TABLE conversation_memory_summaries (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    source_message_ids_json TEXT NOT NULL,
    vector_json TEXT NOT NULL,
    is_important INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX conversation_memory_summaries_conversation_idx
    ON conversation_memory_summaries(conversation_id, created_at);
