-- Register Apify as an optional provider; does not enable it or modify existing credentials.
INSERT INTO integration_providers(code,name,auth_type)
VALUES ('apify','Apify — TikTok & Instagram','api_key')
ON CONFLICT (code) DO NOTHING;
