ALTER TABLE prompt_presets ADD COLUMN toggles_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE prompt_presets ADD COLUMN regex_scripts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE prompt_presets ADD COLUMN module_integrations_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE prompt_presets ADD COLUMN prompt_settings_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE prompt_modules ADD COLUMN source_id TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_modules ADD COLUMN regex_scripts_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE characters ADD COLUMN regex_scripts_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE characters ADD COLUMN module_references_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE generation_runs ADD COLUMN processed_output_text TEXT NOT NULL DEFAULT '';

CREATE TABLE prompt_module_assets (
    id TEXT PRIMARY KEY NOT NULL,
    module_id TEXT NOT NULL REFERENCES prompt_modules(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    source_uri TEXT NOT NULL
);

CREATE INDEX prompt_module_assets_module_idx ON prompt_module_assets(module_id);

UPDATE conversations
SET toggles_json = COALESCE((
    SELECT json_group_object(
        key,
        CASE type
            WHEN 'true' THEN '1'
            WHEN 'false' THEN '0'
            ELSE CAST(value AS TEXT)
        END
    )
    FROM json_each(conversations.toggles_json)
), '{}')
WHERE json_valid(toggles_json);
