ALTER TABLE conversations ADD COLUMN prompt_preset_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN persona_locked INTEGER NOT NULL DEFAULT 0;
