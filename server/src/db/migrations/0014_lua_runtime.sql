ALTER TABLE characters ADD COLUMN default_variables_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN lua_code TEXT;
ALTER TABLE characters ADD COLUMN lua_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN lua_low_level_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN lua_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN lua_code_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN lua_raw_trigger_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE prompt_modules ADD COLUMN runtime_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompt_modules ADD COLUMN lua_code TEXT;
ALTER TABLE prompt_modules ADD COLUMN lua_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompt_modules ADD COLUMN lua_low_level_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompt_modules ADD COLUMN lua_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prompt_modules ADD COLUMN lua_code_sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_modules ADD COLUMN lua_raw_trigger_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE conversations ADD COLUMN display_epoch INTEGER NOT NULL DEFAULT 0;

CREATE TABLE lua_states (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('character', 'module')),
    owner_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, owner_type, owner_id, state_key)
);

CREATE TABLE lua_event_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    phase TEXT NOT NULL,
    client_instance_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    input_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error_json TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (conversation_id, event_key, phase)
);

CREATE TABLE lua_invocations (
    id TEXT PRIMARY KEY,
    event_run_id TEXT NOT NULL REFERENCES lua_event_runs(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('character', 'module')),
    owner_id TEXT NOT NULL,
    script_revision INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    result_json TEXT,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error_json TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (event_run_id, owner_type, owner_id, script_revision)
);

CREATE TABLE lua_api_calls (
    id TEXT PRIMARY KEY,
    invocation_id TEXT NOT NULL REFERENCES lua_invocations(id) ON DELETE CASCADE,
    call_index INTEGER NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed', 'indeterminate')),
    request_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    error_json TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (invocation_id, call_index)
);

CREATE TABLE lua_remote_commands (
    id TEXT PRIMARY KEY,
    invocation_id TEXT NOT NULL REFERENCES lua_invocations(id) ON DELETE CASCADE,
    call_index INTEGER NOT NULL,
    client_instance_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed', 'expired')),
    blocking INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    UNIQUE (invocation_id, call_index)
);

CREATE INDEX lua_remote_commands_client_idx
    ON lua_remote_commands(client_instance_id, status, created_at);

CREATE TABLE lua_display_batches (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    display_epoch INTEGER NOT NULL,
    script_set_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    result_json TEXT,
    error_json TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER,
    PRIMARY KEY (conversation_id, display_epoch, script_set_hash)
);

CREATE TABLE conversation_lore_entries (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (conversation_id, name)
);
