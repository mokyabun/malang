CREATE TABLE prompt_modules (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    namespace TEXT NOT NULL,
    enabled_by_default INTEGER NOT NULL DEFAULT 0,
    prompts_json TEXT NOT NULL,
    toggles_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    source_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX prompt_modules_namespace_idx
ON prompt_modules(namespace)
WHERE namespace <> '';

CREATE TABLE conversation_modules (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    module_id TEXT NOT NULL REFERENCES prompt_modules(id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, module_id)
);
