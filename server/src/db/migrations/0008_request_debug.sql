ALTER TABLE app_settings
ADD COLUMN request_debug_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE request_debug_records (
    id TEXT PRIMARY KEY NOT NULL,
    generation_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    request_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX request_debug_records_created_at_idx
ON request_debug_records(created_at DESC);
