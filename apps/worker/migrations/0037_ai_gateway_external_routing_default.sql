UPDATE ai_gateway_settings
SET route_external_providers = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE route_external_providers = 0;
