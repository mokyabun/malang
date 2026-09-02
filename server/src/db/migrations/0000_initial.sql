CREATE TABLE admin_users (
    id TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    user_name TEXT NOT NULL,
    persona TEXT NOT NULL,
    global_variables_json TEXT NOT NULL,
    default_prompt_preset_id TEXT,
    provider_json TEXT,
    updated_at INTEGER NOT NULL
);
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    personality TEXT NOT NULL,
    scenario TEXT NOT NULL,
    first_message TEXT NOT NULL,
    alternate_greetings_json TEXT NOT NULL,
    example_message TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    post_history_instructions TEXT NOT NULL,
    creator TEXT NOT NULL,
    character_version TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    avatar_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    source_spec TEXT NOT NULL CHECK (source_spec IN ('v2', 'v3')),
    source_extensions_json TEXT NOT NULL,
    source_card_json TEXT NOT NULL,
    lore_settings_json TEXT NOT NULL,
    archived_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE character_lore_entries (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    keys_json TEXT NOT NULL,
    secondary_keys_json TEXT NOT NULL,
    content TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    constant INTEGER NOT NULL,
    selective INTEGER NOT NULL,
    case_sensitive INTEGER NOT NULL,
    use_regex INTEGER NOT NULL,
    insertion_order INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    name TEXT NOT NULL,
    extensions_json TEXT NOT NULL
);
CREATE INDEX character_lore_character_idx ON character_lore_entries(character_id);
CREATE TABLE character_assets (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    source_uri TEXT NOT NULL
);
CREATE INDEX character_assets_character_idx ON character_assets(character_id);
CREATE TABLE prompt_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    blocks_json TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    default_variables_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    source_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE RESTRICT,
    prompt_preset_id TEXT NOT NULL REFERENCES prompt_presets(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    greeting_index INTEGER NOT NULL,
    variables_json TEXT NOT NULL,
    toggles_json TEXT NOT NULL,
    archived_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'cancelled', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(conversation_id, position)
);
CREATE TABLE generation_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'cancelled', 'failed')),
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    output_text TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    error_code TEXT,
    error_message TEXT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE(conversation_id, idempotency_key)
);
