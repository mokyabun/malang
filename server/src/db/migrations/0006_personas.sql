CREATE TABLE personas (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    avatar_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE app_settings ADD COLUMN selected_persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN bound_persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL;
