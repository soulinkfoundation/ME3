import { describe, expect, it, vi } from "vitest";
import app from "./index";
import type { DbPluginInstallation } from "./plugins";
import type {
  DbAiModelDefault,
  DbAiProviderCredential,
  DbEmailProviderSetting,
  DbEmailSendAudit,
  DbMailboxAlias,
  DbMailboxMessage,
  Env,
  OwnerProfile,
} from "./types";

type StoredMessage = {
  id: string;
  ownerId: string;
  role: string;
  content: string;
};

type StoredOwner = OwnerProfile & { password_hash: string | null };
type StoredMailboxMessage = DbMailboxMessage & {
  mailbox_id: string;
  updated_at: string;
};
type StoredTelegramConnection = {
  id: string;
  user_id: string;
  channel: "telegram";
  status: "pending" | "active" | "disconnected";
  setup_token: string;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  telegram_last_name: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
};

type StoredSocialAccount = {
  id: string;
  user_id: string;
  site_id: string;
  platform: "x" | "linkedin" | "instagram" | "instagram_business";
  platform_account_id: string;
  platform_handle: string | null;
  display_name: string | null;
  status: "active" | "expired" | "revoked" | "error";
  scopes_json: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function createEnv(): Env & {
  owner: StoredOwner | null;
  messages: StoredMessage[];
  mailbox: DbMailboxAlias | null;
  pluginInstallations: DbPluginInstallation[];
  installSecrets: Map<string, string>;
  aiCredentials: DbAiProviderCredential[];
  aiDefaults: DbAiModelDefault[];
  emailProviderSettings: DbEmailProviderSetting[];
  emailSendAudit: DbEmailSendAudit[];
  emailSends: Array<Record<string, unknown>>;
  mailboxMessages: StoredMailboxMessage[];
  telegramConnection: StoredTelegramConnection | null;
  socialAccounts: StoredSocialAccount[];
} {
  const state = {
    owner: null as StoredOwner | null,
    messages: [] as StoredMessage[],
    mailbox: null as DbMailboxAlias | null,
    pluginInstallations: [] as DbPluginInstallation[],
    installSecrets: new Map<string, string>(),
    aiCredentials: [] as DbAiProviderCredential[],
    aiDefaults: [] as DbAiModelDefault[],
    emailProviderSettings: [] as DbEmailProviderSetting[],
    emailSendAudit: [] as DbEmailSendAudit[],
    emailSends: [] as Array<Record<string, unknown>>,
    mailboxMessages: [] as StoredMailboxMessage[],
    telegramConnection: null as StoredTelegramConnection | null,
    socialAccounts: [] as StoredSocialAccount[],
  };

  const db = {
    prepare(sql: string) {
      return {
        async all<T>() {
          if (sql.includes("FROM plugin_installations")) {
            return { results: state.pluginInstallations as T[] };
          }
          if (sql.includes("FROM social_accounts")) {
            return { results: state.socialAccounts as T[] };
          }
          return { results: [] as T[] };
        },
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO owner_profile")) {
                state.owner = {
                  id: values[0] as string,
                  email: values[1] as string | null,
                  name: values[2] as string | null,
                  username: values[3] as string | null,
                  bio: values[4] as string | null,
                  avatar_url: values[5] as string | null,
                  timezone: values[6] as string | null,
                  locale: null,
                  password_hash: values[7] as string | null,
                };
              }

              if (sql.includes("UPDATE owner_profile") && state.owner) {
                if (sql.includes("password_hash = ?")) {
                  state.owner.password_hash = values[0] as string;
                  return { success: true };
                }
                let valueIndex = 0;
                if (sql.includes("timezone = ?")) {
                  state.owner.timezone = values[valueIndex] as string | null;
                  valueIndex += 1;
                }
                if (sql.includes("locale = ?")) {
                  state.owner.locale = values[valueIndex] as string | null;
                }
              }

              if (sql.includes("DELETE FROM owner_profile")) {
                state.owner = null;
              }

              if (sql.includes("INSERT INTO assistant_messages")) {
                state.messages.push({
                  id: values[0] as string,
                  ownerId: values[1] as string,
                  role: values[2] as string,
                  content: values[3] as string,
                });
              }

              if (sql.includes("INSERT INTO plugin_installations")) {
                const existingIndex = state.pluginInstallations.findIndex(
                  (installation) => installation.plugin_id === values[0],
                );
                const existing =
                  existingIndex >= 0 ? state.pluginInstallations[existingIndex] : null;
                const installation: DbPluginInstallation = {
                  plugin_id: values[0] as string,
                  version: values[1] as string,
                  enabled: values[2] as number,
                  status: values[3] as DbPluginInstallation["status"],
                  granted_permissions_json:
                    sql.includes("granted_permissions_json = excluded.granted_permissions_json") ||
                    !existing
                      ? (values[4] as string)
                      : existing.granted_permissions_json,
                  setup_state_json: values[5] as string,
                  installed_at: existing?.installed_at || (values[6] as string),
                  updated_at: values[7] as string,
                };
                if (existingIndex >= 0) {
                  state.pluginInstallations[existingIndex] = installation;
                } else {
                  state.pluginInstallations.push(installation);
                }
              }

              if (sql.includes("INSERT INTO install_secrets")) {
                if (!state.installSecrets.has(values[0] as string)) {
                  state.installSecrets.set(values[0] as string, values[1] as string);
                }
              }

              if (sql.includes("INSERT INTO ai_provider_credentials")) {
                const existingIndex = state.aiCredentials.findIndex(
                  (credential) =>
                    credential.user_id === values[0] &&
                    credential.provider_id === values[1],
                );
                const credential: DbAiProviderCredential = {
                  user_id: values[0] as string,
                  provider_id: values[1] as string,
                  encrypted_api_key: values[2] as string,
                  api_key_hint: values[3] as string,
                  api_key_updated_at: values[4] as string,
                  created_at: values[5] as string,
                  updated_at: values[6] as string,
                };
                if (existingIndex >= 0) {
                  state.aiCredentials[existingIndex] = {
                    ...state.aiCredentials[existingIndex],
                    ...credential,
                    created_at: state.aiCredentials[existingIndex].created_at,
                  };
                } else {
                  state.aiCredentials.push(credential);
                }
              }

              if (sql.includes("DELETE FROM ai_provider_credentials")) {
                state.aiCredentials = state.aiCredentials.filter(
                  (credential) =>
                    credential.user_id !== values[0] ||
                    credential.provider_id !== values[1],
                );
              }

              if (sql.includes("INSERT INTO ai_model_defaults")) {
                const existingIndex = state.aiDefaults.findIndex(
                  (defaultRow) =>
                    defaultRow.user_id === values[0] &&
                    defaultRow.use_case === values[1],
                );
                const defaultRow: DbAiModelDefault = {
                  user_id: values[0] as string,
                  use_case: values[1] as string,
                  provider_id: values[2] as string,
                  model: values[3] as string,
                  created_at: values[4] as string,
                  updated_at: values[5] as string,
                };
                if (existingIndex >= 0) {
                  state.aiDefaults[existingIndex] = {
                    ...state.aiDefaults[existingIndex],
                    ...defaultRow,
                    created_at: state.aiDefaults[existingIndex].created_at,
                  };
                } else {
                  state.aiDefaults.push(defaultRow);
                }
              }

              if (sql.includes("DELETE FROM ai_model_defaults")) {
                state.aiDefaults = state.aiDefaults.filter(
                  (defaultRow) =>
                    defaultRow.user_id !== values[0] ||
                    defaultRow.use_case !== values[1],
                );
              }

              if (sql.includes("INSERT INTO email_provider_settings")) {
                const existingIndex = state.emailProviderSettings.findIndex(
                  (setting) =>
                    setting.user_id === values[0] &&
                    setting.provider_id === values[1],
                );
                const existing =
                  existingIndex >= 0 ? state.emailProviderSettings[existingIndex] : null;
                const setting: DbEmailProviderSetting = {
                  user_id: values[0] as string,
                  provider_id: values[1] as string,
                  is_active: values[2] as number,
                  encrypted_secret: values[3] as string | null,
                  secret_hint: values[4] as string | null,
                  secret_updated_at: values[5] as string | null,
                  config_json: values[6] as string | null,
                  last_status: existing?.last_status || null,
                  last_status_checked_at: existing?.last_status_checked_at || null,
                  last_test_sent_at: existing?.last_test_sent_at || null,
                  last_test_error: existing?.last_test_error || null,
                  created_at: existing?.created_at || (values[7] as string),
                  updated_at: values[8] as string,
                };
                if (existingIndex >= 0) {
                  state.emailProviderSettings[existingIndex] = setting;
                } else {
                  state.emailProviderSettings.push(setting);
                }
              }

              if (
                sql.includes("UPDATE email_provider_settings") &&
                sql.includes("SET is_active = 0")
              ) {
                state.emailProviderSettings = state.emailProviderSettings.map((setting) =>
                  setting.user_id === values[0] ? { ...setting, is_active: 0 } : setting,
                );
              }

              if (
                sql.includes("UPDATE email_provider_settings") &&
                sql.includes("SET is_active = 1")
              ) {
                state.emailProviderSettings = state.emailProviderSettings.map((setting) =>
                  setting.user_id === values[1] && setting.provider_id === values[2]
                    ? { ...setting, is_active: 1, updated_at: values[0] as string }
                    : setting,
                );
              }

              if (
                sql.includes("UPDATE email_provider_settings") &&
                sql.includes("last_status = ?")
              ) {
                state.emailProviderSettings = state.emailProviderSettings.map((setting) =>
                  setting.user_id === values[5] && setting.provider_id === values[6]
                    ? {
                        ...setting,
                        last_status: values[0] as DbEmailProviderSetting["last_status"],
                        last_status_checked_at: values[1] as string,
                        last_test_sent_at:
                          (values[2] as string | null) || setting.last_test_sent_at,
                        last_test_error: values[3] as string | null,
                        updated_at: values[4] as string,
                      }
                    : setting,
                );
              }

              if (sql.includes("INSERT INTO email_send_audit")) {
                state.emailSendAudit.push({
                  id: values[0] as string,
                  user_id: values[1] as string,
                  mailbox_id: values[2] as string | null,
                  mailbox_message_id: values[3] as string | null,
                  provider_id: values[4] as string,
                  provider_message_id: values[5] as string | null,
                  provider_status: values[6] as string | null,
                  status: values[7] as DbEmailSendAudit["status"],
                  purpose: values[8] as DbEmailSendAudit["purpose"],
                  from_address: values[9] as string,
                  to_address: values[10] as string,
                  subject: values[11] as string,
                  thread_key: values[12] as string | null,
                  message_id_header: values[13] as string | null,
                  in_reply_to: values[14] as string | null,
                  references_header: values[15] as string | null,
                  metadata_json: values[16] as string,
                  error_message: values[17] as string | null,
                  created_by: values[18] as string,
                  approved_by_user_id: values[19] as string | null,
                  requested_at: values[20] as string,
                  sent_at: values[21] as string | null,
                  created_at: values[22] as string,
                  updated_at: values[23] as string,
                });
              }

              if (sql.includes("INSERT INTO mailbox_messages")) {
                state.mailboxMessages.push({
                  id: values[0] as string,
                  mailbox_id: values[1] as string,
                  direction: "outbound",
                  message_kind: "draft",
                  status: "pending_approval",
                  thread_key: values[2] as string,
                  provider_id: null,
                  provider_message_id: null,
                  from_address: values[3] as string,
                  to_address: values[4] as string,
                  subject: values[5] as string,
                  text_body: values[6] as string,
                  html_body: values[7] as string | null,
                  raw_headers_json: null,
                  raw_message: null,
                  metadata_json: values[8] as string,
                  source_id: values[9] as string | null,
                  folder: "drafts",
                  read_at: null,
                  agent_summary: null,
                  agent_labels_json: null,
                  forwarded_to: null,
                  error_message: null,
                  created_by: values[10] as string,
                  approved_by_user_id: null,
                  received_at: null,
                  approved_at: null,
                  sent_at: null,
                  created_at: values[11] as string,
                  updated_at: values[12] as string,
                });
              }

              if (sql.includes("INSERT INTO mailbox_aliases")) {
                state.mailbox = {
                  id: values[0] as string,
                  user_id: values[1] as string,
                  alias_local_part: values[2] as string,
                  forwarding_email: values[3] as string,
                  forwarding_status: values[4] as DbMailboxAlias["forwarding_status"],
                  forwarding_enabled: values[5] as number,
                  forwarding_mode: values[6] as DbMailboxAlias["forwarding_mode"],
                  status: "pending_setup",
                  approval_policy: "all",
                  daily_inbound_limit: 25,
                  daily_outbound_limit: 25,
                  activated_at: null,
                  cf_destination_id: null,
                  cf_destination_verified_at: null,
                  cf_rule_id: null,
                  cf_last_synced_at: null,
                  cf_last_error: null,
                  created_at: values[7] as string,
                  updated_at: values[8] as string,
                };
              }

              if (sql.includes("UPDATE mailbox_aliases") && state.mailbox) {
                if (sql.includes("alias_local_part = ?")) {
                  state.mailbox.alias_local_part = values[0] as string;
                  state.mailbox.forwarding_email = values[1] as string;
                  state.mailbox.forwarding_status = values[2] as DbMailboxAlias["forwarding_status"];
                  state.mailbox.forwarding_enabled = values[3] as number;
                  state.mailbox.forwarding_mode = values[4] as DbMailboxAlias["forwarding_mode"];
                  state.mailbox.updated_at = values[5] as string;
                } else if (sql.includes("status = 'active'")) {
                  state.mailbox.status = "active";
                  state.mailbox.activated_at = state.mailbox.activated_at || (values[0] as string);
                  state.mailbox.updated_at = values[1] as string;
                } else if (sql.includes("status = 'paused'")) {
                  state.mailbox.status = "paused";
                  state.mailbox.updated_at = values[0] as string;
                }
              }

              if (
                sql.includes("UPDATE mailbox_messages") &&
                sql.includes("message_kind = 'email'")
              ) {
                state.mailboxMessages = state.mailboxMessages.map((message) =>
                  message.id === values[6] && message.mailbox_id === values[7]
                    ? {
                        ...message,
                        message_kind: "email",
                        status: "sent",
                        folder: "sent",
                        provider_id: values[0] as string,
                        provider_message_id: values[1] as string | null,
                        error_message: null,
                        approved_by_user_id: values[2] as string,
                        approved_at: values[3] as string,
                        sent_at: values[4] as string,
                        updated_at: values[5] as string,
                      }
                    : message,
                );
              }

              if (
                sql.includes("UPDATE mailbox_messages") &&
                sql.includes("status = 'pending_approval'")
              ) {
                state.mailboxMessages = state.mailboxMessages.map((message) =>
                  message.id === values[10] && message.mailbox_id === values[11]
                    ? {
                        ...message,
                        status: "pending_approval",
                        thread_key: values[0] as string,
                        from_address: values[1] as string,
                        to_address: values[2] as string,
                        subject: values[3] as string,
                        text_body: values[4] as string,
                        html_body: values[5] as string | null,
                        metadata_json: values[6] as string,
                        source_id: values[7] as string | null,
                        folder: "drafts",
                        created_by: values[8] as string,
                        error_message: null,
                        updated_at: values[9] as string,
                      }
                    : message,
                );
              }

              if (
                sql.includes("UPDATE mailbox_messages") &&
                sql.includes("status = 'failed'")
              ) {
                state.mailboxMessages = state.mailboxMessages.map((message) =>
                  message.id === values[2] && message.mailbox_id === values[3]
                    ? {
                        ...message,
                        status: "failed",
                        error_message: values[0] as string,
                        updated_at: values[1] as string,
                      }
                    : message,
                );
              }

              if (
                sql.includes("UPDATE mailbox_messages") &&
                sql.includes("status = 'rejected'")
              ) {
                state.mailboxMessages = state.mailboxMessages.map((message) =>
                  message.id === values[3] && message.mailbox_id === values[4]
                    ? {
                        ...message,
                        status: "rejected",
                        folder: "trash",
                        approved_by_user_id: values[0] as string,
                        approved_at: values[1] as string,
                        updated_at: values[2] as string,
                      }
                    : message,
                );
              }

              if (sql.includes("INSERT INTO agent_channel_connections")) {
                state.telegramConnection = {
                  id: (state.telegramConnection?.id || values[0]) as string,
                  user_id: values[1] as string,
                  channel: "telegram",
                  status: "pending",
                  setup_token: values[2] as string,
                  telegram_user_id: null,
                  telegram_chat_id: null,
                  telegram_username: null,
                  telegram_first_name: null,
                  telegram_last_name: null,
                  connected_at: null,
                  disconnected_at: null,
                  last_inbound_at: null,
                  last_outbound_at: null,
                  created_at: "2026-05-11T10:00:00Z",
                  updated_at: "2026-05-11T10:00:00Z",
                };
              }

              if (sql.includes("UPDATE agent_channel_connections") && state.telegramConnection) {
                state.telegramConnection = {
                  ...state.telegramConnection,
                  status: "disconnected",
                  telegram_user_id: null,
                  telegram_chat_id: null,
                  telegram_username: null,
                  telegram_first_name: null,
                  telegram_last_name: null,
                  disconnected_at: "2026-05-11T10:05:00Z",
                  updated_at: "2026-05-11T10:05:00Z",
                };
              }

              return { success: true };
            },
            async first<T>() {
              if (sql.includes("COUNT(*) AS count") && sql.includes("FROM mailbox_messages")) {
                const mailboxId = values[0] as string;
                return {
                  count: state.mailboxMessages.filter(
                    (message) => message.mailbox_id === mailboxId,
                  ).length,
                } as T;
              }

              if (sql.includes("SELECT password_hash FROM owner_profile")) {
                return state.owner ? ({ password_hash: state.owner.password_hash } as T) : null;
              }

              if (sql.includes("lower(email)") && String(values[0]) === state.owner?.email?.toLowerCase()) {
                return state.owner as T;
              }

              if (sql.includes("FROM owner_profile") && values[0] === state.owner?.id) {
                return state.owner as T;
              }
              if (sql.includes("FROM mailbox_aliases")) {
                return state.mailbox && values[0] === state.mailbox.user_id
                  ? (state.mailbox as T)
                  : null;
              }
              if (sql.includes("FROM email_provider_settings")) {
                return (
                  state.emailProviderSettings.find(
                    (setting) =>
                      setting.user_id === values[0] &&
                      setting.provider_id === "postmark",
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM mailbox_messages")) {
                return (
                  state.mailboxMessages.find(
                    (message) =>
                      message.id === values[0] && message.mailbox_id === values[1],
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM agent_channel_connections")) {
                return state.telegramConnection && values[0] === state.telegramConnection.user_id
                  ? (state.telegramConnection as T)
                  : null;
              }
              if (sql.includes("FROM plugin_installations")) {
                return (
                  state.pluginInstallations.find(
                    (installation) => installation.plugin_id === values[0],
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM install_secrets")) {
                const value = state.installSecrets.get(values[0] as string);
                return value ? ({ value } as T) : null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM ai_provider_credentials")) {
                return {
                  results: state.aiCredentials.filter(
                    (credential) => credential.user_id === values[0],
                  ) as T[],
                };
              }
              if (sql.includes("FROM ai_model_defaults")) {
                return {
                  results: state.aiDefaults.filter(
                    (defaultRow) => defaultRow.user_id === values[0],
                  ) as T[],
                };
              }
              if (sql.includes("FROM email_provider_settings")) {
                return {
                  results: state.emailProviderSettings.filter(
                    (setting) => setting.user_id === values[0],
                  ) as T[],
                };
              }
              if (sql.includes("FROM mailbox_messages")) {
                const mailboxId = values[0] as string;
                return {
                  results: state.mailboxMessages.filter(
                    (message) => message.mailbox_id === mailboxId,
                  ) as T[],
                };
              }
              if (sql.includes("FROM agent_channel_events")) {
                return { results: [] as T[] };
              }
              if (sql.includes("FROM social_accounts")) {
                return {
                  results: state.socialAccounts.filter(
                    (account) => account.user_id === values[0],
                  ) as T[],
                };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  };

  return {
    get owner() {
      return state.owner;
    },
    set owner(value: StoredOwner | null) {
      state.owner = value;
    },
    get messages() {
      return state.messages;
    },
    get mailbox() {
      return state.mailbox;
    },
    set mailbox(value: DbMailboxAlias | null) {
      state.mailbox = value;
    },
    get pluginInstallations() {
      return state.pluginInstallations;
    },
    get installSecrets() {
      return state.installSecrets;
    },
    get aiCredentials() {
      return state.aiCredentials;
    },
    get aiDefaults() {
      return state.aiDefaults;
    },
    get emailProviderSettings() {
      return state.emailProviderSettings;
    },
    get emailSendAudit() {
      return state.emailSendAudit;
    },
    get emailSends() {
      return state.emailSends;
    },
    get mailboxMessages() {
      return state.mailboxMessages;
    },
    get telegramConnection() {
      return state.telegramConnection;
    },
    set telegramConnection(value: StoredTelegramConnection | null) {
      state.telegramConnection = value;
    },
    get socialAccounts() {
      return state.socialAccounts;
    },
    DB: db as unknown as D1Database,
    ENVIRONMENT: "local",
    CORE_WEB_ORIGIN: "http://localhost:5174",
    CORE_API_ORIGIN: "http://localhost:8787",
    JWT_SECRET: "test-secret-at-least-long-enough",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key",
    ADMIN_BOOTSTRAP_CODE: "owner-code",
    TELEGRAM_BOT_USERNAME: "me3_core_test_bot",
    EMAIL: {
      async send(message) {
        state.emailSends.push(message as Record<string, unknown>);
        return { messageId: `cf-${state.emailSends.length}` };
      },
    },
  };
}

async function bootstrap(env: Env) {
  return app.fetch(
    new Request("http://localhost/api/admin/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:5174" },
      body: JSON.stringify({
        bootstrapCode: "owner-code",
        email: "owner@example.com",
        name: "ME3 Core Owner",
        username: "owner",
        password: "correct-horse-battery",
      }),
    }),
    env,
  );
}

function cookieHeader(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!.split(";")[0];
}

function responseCookieCleared(response: Response): boolean {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.includes("me3_core_session=") && setCookie.includes("Max-Age=0");
}

describe("ME3 Core Worker auth", () => {
  it("bootstraps the owner and sets an httpOnly session cookie", async () => {
    const env = createEnv();

    const response = await bootstrap(env);
    const body = (await response.json()) as { ok: boolean; owner: OwnerProfile };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.owner.email).toBe("owner@example.com");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(response.headers.get("set-cookie")).toContain("me3_core_session=");
  });

  it("generates an install encryption key during bootstrap when no env key is provided", async () => {
    const env = createEnv();
    env.TOKEN_ENCRYPTION_KEY = undefined;

    const response = await bootstrap(env);
    const configResponse = await app.fetch(new Request("http://localhost/api/config"), env);
    const config = (await configResponse.json()) as { setupRequired: string[] };

    expect(response.status).toBe(200);
    expect(env.installSecrets.get("TOKEN_ENCRYPTION_KEY")).toMatch(/^[a-f0-9]{64}$/);
    expect(config.setupRequired).not.toContain("TOKEN_ENCRYPTION_KEY");
  });

  it("reports whether owner password auth is configured", async () => {
    const env = createEnv();

    const before = await app.fetch(new Request("http://localhost/api/config"), env);
    expect((await before.json()) as { ownerAuthConfigured: boolean }).toMatchObject({
      ownerAuthConfigured: false,
    });

    await bootstrap(env);

    const after = await app.fetch(new Request("http://localhost/api/config"), env);
    expect((await after.json()) as { ownerAuthConfigured: boolean }).toMatchObject({
      ownerAuthConfigured: true,
    });
  });

  it("rejects invalid bootstrap codes without issuing a session", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapCode: "wrong" }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("requires a password during bootstrap", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapCode: "owner-code",
          email: "owner@example.com",
          name: "ME3 Core Owner",
          username: "owner",
          password: "short",
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("logs in the owner with email and password", async () => {
    const env = createEnv();
    await bootstrap(env);

    const response = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "correct-horse-battery",
        }),
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; owner: OwnerProfile & { password_hash?: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.owner.id).toBe("owner");
    expect(body.owner.password_hash).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("rejects invalid owner passwords", async () => {
    const env = createEnv();
    await bootstrap(env);

    const response = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "wrong-password",
        }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("resets the owner password with the bootstrap code", async () => {
    const env = createEnv();
    await bootstrap(env);

    const resetResponse = await app.fetch(
      new Request("http://localhost/api/auth/password-reset/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          bootstrapCode: "owner-code",
          password: "new-correct-horse",
        }),
      }),
      env,
    );

    expect(resetResponse.status).toBe(200);
    expect(responseCookieCleared(resetResponse)).toBe(true);

    const loginResponse = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "new-correct-horse",
        }),
      }),
      env,
    );

    expect(loginResponse.status).toBe(200);
  });

  it("rejects bootstrap password reset with a bad bootstrap code", async () => {
    const env = createEnv();
    await bootstrap(env);
    const previousHash = env.owner?.password_hash;

    const response = await app.fetch(
      new Request("http://localhost/api/auth/password-reset/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "owner@example.com",
          bootstrapCode: "wrong-code",
          password: "new-correct-horse",
        }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(env.owner?.password_hash).toBe(previousHash);
  });

  it("hydrates the owner session from the signed cookie", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; user: OwnerProfile };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe("owner");
  });

  it("clears the owner session cookie on logout", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("me3_core_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects owner-only assistant requests without a valid session", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(env.messages).toHaveLength(0);
  });

  it("allows owner-only assistant requests with a valid session", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ message: "Hello" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(env.messages).toMatchObject([{ ownerId: "owner", content: "Hello" }]);
  });

  it("loads account settings for the signed-in owner", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      user: { email: string; timezone: string; locale: string; localeSource: string };
    };

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("owner@example.com");
    expect(body.user.timezone).toBe("UTC");
    expect(body.user.locale).toBe("en-US");
    expect(body.user.localeSource).toBe("inferred");
  });

  it("lists curated Core plugins for the signed-in owner", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/plugins", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      catalogVersion: string;
      plugins: Array<{
        id: string;
        status: string;
        implementationStatus: string;
        agentTools: Array<{ id: string; approvalMode: string }>;
        setupRequirements: Array<{ kind: string; configured: boolean; required: boolean }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(body.plugins).toEqual([
      expect.objectContaining({
        id: "me3.social-publishing",
        status: "available",
        implementationStatus: "bundled",
      }),
    ]);
    expect(body.plugins[0].agentTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "content.publish",
          approvalMode: "approval_required",
        }),
      ]),
    );
    expect(body.plugins[0].setupRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "package",
          configured: true,
        }),
        expect.objectContaining({
          kind: "queue",
          configured: false,
          required: false,
        }),
      ]),
    );
  });

  it("requires owner auth for plugin catalog access", async () => {
    const env = createEnv();

    const response = await app.fetch(new Request("http://localhost/api/plugins"), env);

    expect(response.status).toBe(401);
  });

  it("activates bundled Social Publishing when Core prerequisites are configured", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      plugin: {
        id: string;
        installed: boolean;
        enabled: boolean;
        status: string;
        grantedPermissions: string[];
        setupRequirements: Array<{ kind: string; configured: boolean; required: boolean }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.plugin).toMatchObject({
      id: "me3.social-publishing",
      installed: true,
      enabled: true,
      status: "installed",
    });
    expect(body.plugin.grantedPermissions).toEqual([
      "content.social.publish",
      "content.social.accounts.manage",
    ]);
    expect(body.plugin.setupRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "package", configured: true }),
        expect.objectContaining({ kind: "queue", configured: false, required: false }),
      ]),
    );

    const catalogResponse = await app.fetch(
      new Request("http://localhost/api/plugins", {
        headers: { Cookie: session },
      }),
      env,
    );
    const catalog = (await catalogResponse.json()) as {
      plugins: Array<{ id: string; status: string }>;
    };

    expect(catalog.plugins).toEqual([
      expect.objectContaining({
        id: "me3.social-publishing",
        status: "installed",
      }),
    ]);
  });

  it("activates Social Publishing after generating install encryption during setup", async () => {
    const env = createEnv();
    env.TOKEN_ENCRYPTION_KEY = undefined;
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      plugin: {
        status: string;
        setupRequirements: Array<{ kind: string; label: string; configured: boolean }>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.plugin.status).toBe("installed");
    expect(body.plugin.setupRequirements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "secret",
          label: "Token encryption key",
        }),
      ]),
    );
  });

  it("deactivates an installed Social Publishing plugin", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    const response = await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/deactivate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      plugin: { id: string; installed: boolean; enabled: boolean; status: string };
    };

    expect(response.status).toBe(200);
    expect(body.plugin).toMatchObject({
      id: "me3.social-publishing",
      installed: true,
      enabled: false,
      status: "disabled",
    });
  });

  it("exposes Social Publishing runtime status and accounts when installed", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    env.socialAccounts.push({
      id: "social-account-1",
      user_id: "owner",
      site_id: "site-1",
      platform: "linkedin",
      platform_account_id: "linkedin-owner",
      platform_handle: null,
      display_name: "Owner LinkedIn",
      status: "active",
      scopes_json: JSON.stringify(["w_member_social"]),
      last_verified_at: "2026-05-11T10:00:00Z",
      created_at: "2026-05-11T09:00:00Z",
      updated_at: "2026-05-11T10:00:00Z",
    });

    const response = await app.fetch(
      new Request("http://localhost/api/social/accounts", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      plugin: { status: string; ready: boolean };
      accounts: Array<{ id: string; platform: string; scopes: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.plugin).toMatchObject({ status: "installed", ready: true });
    expect(body.accounts).toEqual([
      expect.objectContaining({
        id: "social-account-1",
        platform: "linkedin",
        scopes: ["w_member_social"],
      }),
    ]);
  });

  it("gates Social Publishing account reads when setup is required", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const now = new Date().toISOString();
    env.pluginInstallations.push({
      plugin_id: "me3.social-publishing",
      version: "0.1.0",
      enabled: 1,
      status: "setup_required",
      granted_permissions_json: "[]",
      setup_state_json: "{}",
      installed_at: now,
      updated_at: now,
    });

    const response = await app.fetch(
      new Request("http://localhost/api/social/accounts", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      error: string;
      plugin: { status: string; ready: boolean };
    };

    expect(response.status).toBe(424);
    expect(body.error).toBe("Social Publishing setup is required");
    expect(body.plugin).toMatchObject({ status: "setup_required", ready: false });
  });

  it("gates Social Publishing account reads when disabled", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/deactivate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    const response = await app.fetch(
      new Request("http://localhost/api/social/accounts", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      error: string;
      plugin: { status: string; enabled: boolean; ready: boolean };
    };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Social Publishing is disabled");
    expect(body.plugin).toMatchObject({
      status: "disabled",
      enabled: false,
      ready: false,
    });
  });

  it("rejects activation for plugins outside the catalog", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/plugins/unknown.plugin/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(404);
  });

  it("loads AI provider settings for the signed-in owner", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/ai-settings", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      encryptionConfigured: boolean;
      providers: Array<{ id: string; configured: boolean; setupRequired: boolean }>;
      routes: Array<{ id: string; providerId: string; model: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.encryptionConfigured).toBe(true);
    expect(body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai",
          configured: false,
          setupRequired: true,
        }),
        expect.objectContaining({
          id: "workers-ai",
          configured: false,
          setupRequired: true,
        }),
      ]),
    );
    expect(body.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "chat",
          providerId: "workers-ai",
          model: "@cf/meta/llama-3.1-8b-instruct",
        }),
      ]),
    );
  });

  it("saves encrypted AI provider keys and model defaults", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/ai-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          providers: [{ id: "openai", apiKey: "sk-test-secret-1234" }],
          defaults: {
            chat: { providerId: "openai", model: "gpt-4.1-mini" },
            reasoning: { providerId: "openai", model: "o4-mini" },
            extraction: { providerId: "openai", model: "gpt-4.1-mini" },
          },
        }),
      }),
      env,
    );
    const body = (await response.json()) as {
      providers: Array<{ id: string; configured: boolean; source: string; keyHint: string }>;
      defaults: { chat: { providerId: string; model: string; configured: boolean } };
    };

    expect(response.status).toBe(200);
    expect(body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai",
          configured: true,
          source: "stored",
          keyHint: "***1234",
        }),
      ]),
    );
    expect(body.defaults.chat).toMatchObject({
      providerId: "openai",
      model: "gpt-4.1-mini",
      configured: true,
    });
    expect(env.aiCredentials[0].encrypted_api_key).toMatch(/^v1\./);
    expect(env.aiCredentials[0].encrypted_api_key).not.toContain("sk-test-secret-1234");
    expect(env.aiDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          use_case: "chat",
          provider_id: "openai",
          model: "gpt-4.1-mini",
        }),
      ]),
    );
  });

  it("requires owner auth for AI provider settings", async () => {
    const env = createEnv();

    const response = await app.fetch(new Request("http://localhost/api/ai-settings"), env);

    expect(response.status).toBe(401);
  });

  it("loads Cloudflare-first email provider settings for the signed-in owner", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/email-provider-settings", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      encryptionConfigured: boolean;
      activeProviderId: string;
      providers: Array<{
        id: string;
        recommended: boolean;
        setupRequirements: Array<{ id: string; label: string }>;
      }>;
      futureProviders: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.encryptionConfigured).toBe(true);
    expect(body.activeProviderId).toBe("cloudflare-email");
    expect(body.providers[0]).toMatchObject({
      id: "cloudflare-email",
      recommended: true,
    });
    expect(body.providers[0].setupRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workers-paid",
          label: "Workers Paid plan",
        }),
        expect.objectContaining({
          id: "binding-or-api",
        }),
      ]),
    );
    expect(body.providers[1]).toMatchObject({
      id: "postmark",
      recommended: false,
    });
    expect(body.futureProviders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "mailgun" }),
        expect.objectContaining({ id: "smtp" }),
      ]),
    );
  });

  it("saves encrypted Postmark sender settings without returning the token", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/email-provider-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          activeProviderId: "postmark",
          providers: [
            {
              id: "postmark",
              fromAddress: "hello@example.com",
              fromName: "ME3 Mail",
              replyToAddress: "reply@example.com",
              messageStream: "outbound",
              serverToken: "postmark-secret-1234",
            },
          ],
        }),
      }),
      env,
    );
    const body = (await response.json()) as {
      activeProviderId: string;
      providers: Array<{
        id: string;
        configured: boolean;
        source: string;
        keyHint: string | null;
        config: { fromAddress: string; fromName: string };
      }>;
    };
    const postmark = body.providers.find((provider) => provider.id === "postmark");

    expect(response.status).toBe(200);
    expect(body.activeProviderId).toBe("postmark");
    expect(postmark).toMatchObject({
      configured: true,
      source: "stored",
      keyHint: "***1234",
      config: {
        fromAddress: "hello@example.com",
        fromName: "ME3 Mail",
      },
    });
    expect(JSON.stringify(body)).not.toContain("postmark-secret-1234");
    expect(env.emailProviderSettings[0].encrypted_secret).toMatch(/^v1\./);
    expect(env.emailProviderSettings[0].encrypted_secret).not.toContain(
      "postmark-secret-1234",
    );
  });

  it("sends a Cloudflare Email Service test message through the binding adapter", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/email-provider-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          activeProviderId: "cloudflare-email",
          providers: [
            {
              id: "cloudflare-email",
              transport: "binding",
              fromAddress: "owner@example.com",
              fromName: "ME3 Owner",
              sendingDomain: "example.com",
            },
          ],
        }),
      }),
      env,
    );

    const response = await app.fetch(
      new Request("http://localhost/api/email-provider-settings/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          providerId: "cloudflare-email",
          to: "owner@example.com",
        }),
      }),
      env,
    );
    const body = (await response.json()) as {
      ok: boolean;
      providerId: string;
      providerMessageId: string;
      sentTo: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      providerId: "cloudflare-email",
      providerMessageId: "cf-1",
      sentTo: "owner@example.com",
    });
    expect(env.emailSends[0]).toMatchObject({
      from: { email: "owner@example.com", name: "ME3 Owner" },
      to: "owner@example.com",
      subject: "ME3 Core test email",
    });
    expect(env.emailSendAudit).toEqual([
      expect.objectContaining({
        provider_id: "cloudflare-email",
        provider_message_id: "cf-1",
        status: "sent",
        purpose: "test",
      }),
    ]);
  });

  it("sends a Postmark test message through the provider adapter", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ErrorCode: 0,
            Message: "OK",
            MessageID: "pm-test-1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await app.fetch(
        new Request("http://localhost/api/email-provider-settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: session,
          },
          body: JSON.stringify({
            activeProviderId: "postmark",
            providers: [
              {
                id: "postmark",
                fromAddress: "owner@example.com",
                fromName: "ME3 Owner",
                messageStream: "outbound",
                serverToken: "postmark-secret-1234",
              },
            ],
          }),
        }),
        env,
      );

      const response = await app.fetch(
        new Request("http://localhost/api/email-provider-settings/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: session,
          },
          body: JSON.stringify({ to: "owner@example.com" }),
        }),
        env,
      );
      const body = (await response.json()) as {
        ok: boolean;
        providerId: string;
        providerMessageId: string;
        sentTo: string;
      };

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        providerId: "postmark",
        providerMessageId: "pm-test-1",
        sentTo: "owner@example.com",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(env.emailSendAudit).toEqual([
        expect.objectContaining({
          provider_id: "postmark",
          provider_message_id: "pm-test-1",
          status: "sent",
          purpose: "test",
        }),
      ]);
      expect(env.emailProviderSettings[0]).toMatchObject({
        provider_id: "postmark",
        last_status: "ready",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("requires owner auth for email provider settings", async () => {
    const env = createEnv();

    const response = await app.fetch(
      new Request("http://localhost/api/email-provider-settings"),
      env,
    );

    expect(response.status).toBe(401);
  });

  it("updates account timezone and explicit locale", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ timezone: "Europe/Dublin", locale: "en-IE" }),
      }),
      env,
    );
    const body = (await response.json()) as {
      user: { timezone: string; locale: string; localeSource: string };
    };

    expect(response.status).toBe(200);
    expect(body.user.timezone).toBe("Europe/Dublin");
    expect(body.user.locale).toBe("en-IE");
    expect(body.user.localeSource).toBe("explicit");
  });

  it("creates and updates Core mailbox settings", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const createResponse = await app.fetch(
      new Request("http://localhost/api/mailbox", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          aliasLocalPart: "Owner.Mail",
          forwardingEnabled: true,
          forwardingEmail: "inbox@example.com",
        }),
      }),
      env,
    );
    const createBody = (await createResponse.json()) as {
      mailbox: { aliasAddress: string; forwardingEnabled: boolean };
      sources: { address: string }[];
    };

    expect(createResponse.status).toBe(200);
    expect(createBody.mailbox.aliasAddress).toBe("owner.mail@me3.local");
    expect(createBody.mailbox.forwardingEnabled).toBe(true);
    expect(createBody.sources).toMatchObject([{ address: "owner.mail@me3.local" }]);

    const activateResponse = await app.fetch(
      new Request("http://localhost/api/mailbox/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    expect(activateResponse.status).toBe(200);
    expect(env.mailbox?.status).toBe("active");
  });

  it("approves mailbox drafts through the active Postmark provider", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ErrorCode: 0,
            Message: "OK",
            MessageID: "pm-draft-1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await app.fetch(
        new Request("http://localhost/api/email-provider-settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: session,
          },
          body: JSON.stringify({
            activeProviderId: "postmark",
            providers: [
              {
                id: "postmark",
                fromAddress: "hello@example.com",
                fromName: "ME3 Mail",
                messageStream: "outbound",
                serverToken: "postmark-secret-1234",
              },
            ],
          }),
        }),
        env,
      );
      await app.fetch(
        new Request("http://localhost/api/mailbox", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Cookie: session,
          },
          body: JSON.stringify({
            aliasLocalPart: "owner",
            forwardingEnabled: false,
          }),
        }),
        env,
      );

      const draftResponse = await app.fetch(
        new Request("http://localhost/api/mailbox/drafts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: session,
          },
          body: JSON.stringify({
            fromAddress: "hello@example.com",
            to: "client@example.com",
            subject: "Hello",
            textBody: "Approved send body",
            source: "user",
          }),
        }),
        env,
      );
      const draftBody = (await draftResponse.json()) as {
        draft: { id: string; status: string };
      };
      expect(draftResponse.status).toBe(201);
      expect(draftBody.draft.status).toBe("pending_approval");

      const approveResponse = await app.fetch(
        new Request(`http://localhost/api/mailbox/drafts/${draftBody.draft.id}/approve`, {
          method: "POST",
          headers: { Cookie: session },
        }),
        env,
      );
      const approveBody = (await approveResponse.json()) as {
        draft: { status: string; providerId: string; providerMessageId: string };
      };

      expect(approveResponse.status).toBe(200);
      expect(approveBody.draft).toMatchObject({
        status: "sent",
        providerId: "postmark",
        providerMessageId: "pm-draft-1",
      });
      expect(env.mailboxMessages[0]).toMatchObject({
        status: "sent",
        provider_id: "postmark",
        provider_message_id: "pm-draft-1",
      });
      expect(env.emailSendAudit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mailbox_message_id: draftBody.draft.id,
            provider_id: "postmark",
            provider_message_id: "pm-draft-1",
            purpose: "draft",
            status: "sent",
          }),
        ]),
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(JSON.parse(String(init?.body))).toMatchObject({
        To: "client@example.com",
        Subject: "Hello",
        MessageStream: "outbound",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("approves mailbox replies with provider thread headers", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ErrorCode: 0, Message: "OK", MessageID: "pm-reply-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await app.fetch(
        new Request("http://localhost/api/email-provider-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: session },
          body: JSON.stringify({
            activeProviderId: "postmark",
            providers: [
              {
                id: "postmark",
                fromAddress: "hello@example.com",
                fromName: "ME3 Mail",
                messageStream: "outbound",
                serverToken: "postmark-secret-1234",
              },
            ],
          }),
        }),
        env,
      );
      await app.fetch(
        new Request("http://localhost/api/mailbox", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: session },
          body: JSON.stringify({ aliasLocalPart: "owner", forwardingEnabled: false }),
        }),
        env,
      );

      const now = new Date().toISOString();
      env.mailboxMessages.push({
        id: "inbound-1",
        mailbox_id: env.mailbox!.id,
        direction: "inbound",
        message_kind: "email",
        status: "received",
        thread_key: "thread-1",
        provider_id: "postmark",
        provider_message_id: "inbound-provider-1",
        from_address: "client@example.com",
        to_address: "owner@me3.local",
        subject: "Question",
        text_body: "Can you help?",
        html_body: null,
        raw_headers_json: JSON.stringify({
          "message-id": "<client-message@example.com>",
          references: "<previous@example.com>",
        }),
        raw_message: null,
        metadata_json: null,
        source_id: null,
        folder: "inbox",
        read_at: null,
        agent_summary: null,
        agent_labels_json: null,
        forwarded_to: null,
        error_message: null,
        created_by: "system",
        approved_by_user_id: null,
        received_at: now,
        approved_at: null,
        sent_at: null,
        created_at: now,
        updated_at: now,
      });

      const draftResponse = await app.fetch(
        new Request("http://localhost/api/mailbox/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: session },
          body: JSON.stringify({
            fromAddress: "hello@example.com",
            to: "client@example.com",
            subject: "Re: Question",
            textBody: "Happy to help.",
            source: "user",
            replyToMessageId: "inbound-1",
          }),
        }),
        env,
      );
      const draftBody = (await draftResponse.json()) as {
        draft: { id: string; metadata: Record<string, Record<string, string>> };
      };
      expect(draftResponse.status).toBe(201);
      expect(draftBody.draft.metadata.outbound_headers).toMatchObject({
        in_reply_to: "<client-message@example.com>",
        references: "<previous@example.com> <client-message@example.com>",
      });

      const approveResponse = await app.fetch(
        new Request(`http://localhost/api/mailbox/drafts/${draftBody.draft.id}/approve`, {
          method: "POST",
          headers: { Cookie: session },
        }),
        env,
      );

      expect(approveResponse.status).toBe(200);
      expect(env.emailSendAudit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mailbox_message_id: draftBody.draft.id,
            purpose: "reply",
            message_id_header: expect.stringMatching(/^<.+@example\.com>$/),
            in_reply_to: "<client-message@example.com>",
            references_header: "<previous@example.com> <client-message@example.com>",
            status: "sent",
          }),
        ]),
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(JSON.parse(String(init?.body)).Headers).toEqual(
        expect.arrayContaining([
          { Name: "In-Reply-To", Value: "<client-message@example.com>" },
          {
            Name: "References",
            Value: "<previous@example.com> <client-message@example.com>",
          },
        ]),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("deletes the owner account and clears the session cookie", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/account/delete", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(env.owner).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("prepares a Core Telegram setup connection", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/telegram/setup", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      configured: boolean;
      startUrl: string;
      connection: { status: string; telegramUsername: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.configured).toBe(true);
    expect(body.startUrl).toContain("https://t.me/me3_core_test_bot?start=");
    expect(body.connection.status).toBe("pending");
    expect(body.connection.telegramUsername).toBeNull();
  });

  it("reports unavailable Telegram setup when the Core bot username is not configured", async () => {
    const env = createEnv();
    env.TELEGRAM_BOT_USERNAME = undefined;
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/telegram/setup", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "Telegram bot username is not configured",
    });
  });

  it("disconnects an active Telegram account-level connection", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/telegram/setup", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    env.telegramConnection = {
      ...env.telegramConnection!,
      status: "active",
      telegram_user_id: "123",
      telegram_chat_id: "456",
      telegram_username: "owner",
      connected_at: "2026-05-11T10:01:00Z",
    };

    const response = await app.fetch(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      disconnected: boolean;
      connection: { status: string; telegramUsername: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.disconnected).toBe(true);
    expect(body.connection.status).toBe("disconnected");
    expect(body.connection.telegramUsername).toBeNull();
  });
});
