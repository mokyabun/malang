CREATE TABLE model_chain_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    steps_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE conversations ADD COLUMN model_chain_preset_id TEXT REFERENCES model_chain_presets(id) ON DELETE RESTRICT;
