ALTER TABLE app_settings ADD COLUMN secret_salt TEXT;
ALTER TABLE app_settings ADD COLUMN provider_secret_json TEXT;
