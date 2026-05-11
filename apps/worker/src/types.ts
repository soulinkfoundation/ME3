export interface Env {
  DB: D1Database;
  ME3_USER_AGENT?: DurableObjectNamespace;
  AI?: Ai;

  ENVIRONMENT: string;
  CORE_WEB_ORIGIN: string;
  CORE_API_ORIGIN: string;

  JWT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ADMIN_BOOTSTRAP_CODE?: string;

  ME3_AI_DEFAULT_PROVIDER?: string;
  ME3_AI_DEFAULT_MODEL?: string;
  ME3_AI_CHAT_PROVIDER?: string;
  ME3_AI_CHAT_MODEL?: string;
  ME3_AI_REASONING_PROVIDER?: string;
  ME3_AI_REASONING_MODEL?: string;
  ME3_AI_EXTRACTION_PROVIDER?: string;
  ME3_AI_EXTRACTION_MODEL?: string;

  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

export interface OwnerProfile {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  timezone: string | null;
}
