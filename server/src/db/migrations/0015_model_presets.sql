CREATE TABLE model_api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    credential_type TEXT NOT NULL CHECK (credential_type IN ('apiKey', 'serviceAccount', 'aws')),
    hint TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE model_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_json TEXT NOT NULL,
    api_key_id TEXT REFERENCES model_api_keys(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE app_settings ADD COLUMN default_model_preset_id TEXT;
ALTER TABLE app_settings ADD COLUMN default_auxiliary_model_preset_id TEXT;
ALTER TABLE conversations ADD COLUMN model_preset_id TEXT;
ALTER TABLE conversations ADD COLUMN auxiliary_model_preset_id TEXT;

INSERT INTO model_api_keys (
    id, name, provider, credential_type, hint, created_at, updated_at
)
SELECT
    '00000000-0000-4000-8000-000000000003',
    '기존 인증 정보',
    json_extract(provider_json, '$.provider'),
    CASE
        WHEN json_extract(provider_json, '$.credentialType') = 'serviceAccount' THEN 'serviceAccount'
        WHEN json_extract(provider_json, '$.credentialType') = 'aws' THEN 'aws'
        ELSE 'apiKey'
    END,
    '이전 설정에서 이전됨',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM app_settings
WHERE id = 1 AND provider_json IS NOT NULL AND provider_secret_json IS NOT NULL;

INSERT INTO model_presets (
    id, name, provider_json, api_key_id, sort_order, created_at, updated_at
)
SELECT
    '00000000-0000-4000-8000-000000000002',
    '기본 모델',
    provider_json,
    CASE WHEN provider_secret_json IS NOT NULL
        THEN '00000000-0000-4000-8000-000000000003'
        ELSE NULL
    END,
    0,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM app_settings
WHERE id = 1 AND provider_json IS NOT NULL;

UPDATE app_settings
SET default_model_preset_id = '00000000-0000-4000-8000-000000000002'
WHERE id = 1 AND provider_json IS NOT NULL;

