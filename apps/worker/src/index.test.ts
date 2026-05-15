import { describe, expect, it, vi } from "vitest";
import { validateMe3KnowledgeAgainstPlugins } from "@me3/knowledge";
import app, { getMe3CloudUsernamePublishBlockReason } from "./index";
import { CORE_PLUGIN_CATALOG, type DbPluginInstallation } from "./plugins";
import type {
  DbAiModelDefault,
  DbAiProviderCredential,
  DbContact,
  DbEmailProviderSetting,
  DbEmailSendAudit,
  DbMailboxAlias,
  DbMailboxMessage,
  DbUserReminder,
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
  channel: "telegram" | "sandbox";
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
type StoredAgentChannelEvent = {
  id: string;
  connection_id: string;
  channel: "telegram" | "sandbox";
  direction: "inbound" | "outbound" | "system";
  event_type: "start" | "message" | "link" | "send" | "error";
  status: "received" | "pending" | "sent" | "failed" | "linked" | "skipped";
  reply_to_message_id: string | null;
  text_body: string | null;
  raw_json: string | null;
};

type StoredSocialAccount = {
  id: string;
  user_id: string;
  site_id: string;
  platform: "x" | "linkedin" | "instagram" | "instagram_business";
  platform_account_id: string;
  platform_handle: string | null;
  display_name: string | null;
  access_token_ciphertext?: string;
  refresh_token_ciphertext?: string | null;
  token_expires_at?: string | null;
  status: "active" | "expired" | "revoked" | "error";
  scopes_json: string;
  metadata_json?: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};
type StoredSocialProviderSetting = {
  user_id: string;
  provider_id: string;
  client_id: string;
  encrypted_client_secret: string | null;
  secret_hint: string | null;
  secret_updated_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};
type StoredSocialOauthState = {
  id: string;
  state: string;
  user_id: string;
  site_id: string;
  platform: "x" | "linkedin" | "instagram" | "instagram_business";
  return_path: string;
  code_verifier: string | null;
  expires_at: string;
  created_at: string;
};
type StoredMe3ClaimState = {
  state: string;
  redirect_path: string | null;
  expires_at: string;
};
type StoredContentItem = {
  id: string;
  site_id: string;
  site_username: string;
  user_id: string;
  body: string;
  media_manifest_json: string;
  platforms_json: string;
  source_type: "original" | "blog_extract" | "imported" | "reworked";
  source_ref: string | null;
  status: "bank" | "queued" | "scheduled" | "publishing" | "posted" | "failed" | "archived";
  queue_position: number | null;
  scheduled_for: string | null;
  timezone: string | null;
  created_by: "human" | "agent_suggested";
  approved_by_human: number;
  evergreen: number;
  times_posted: number;
  last_posted_at: string | null;
  cooldown_days: number;
  tags_json: string;
  notes: string | null;
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
  reminders: DbUserReminder[];
  contacts: DbContact[];
  telegramConnection: StoredTelegramConnection | null;
  sandboxConnection: StoredTelegramConnection | null;
  agentEvents: StoredAgentChannelEvent[];
  socialAccounts: StoredSocialAccount[];
  socialProviderSettings: StoredSocialProviderSetting[];
  socialOauthStates: StoredSocialOauthState[];
  me3ClaimStates: StoredMe3ClaimState[];
  contentItems: StoredContentItem[];
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
    reminders: [] as DbUserReminder[],
    contacts: [] as DbContact[],
    telegramConnection: null as StoredTelegramConnection | null,
    sandboxConnection: null as StoredTelegramConnection | null,
    agentEvents: [] as StoredAgentChannelEvent[],
    socialAccounts: [] as StoredSocialAccount[],
    socialProviderSettings: [] as StoredSocialProviderSetting[],
    socialOauthStates: [] as StoredSocialOauthState[],
    me3ClaimStates: [] as StoredMe3ClaimState[],
    contentItems: [] as StoredContentItem[],
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
          if (sql.includes("FROM social_provider_settings")) {
            return { results: state.socialProviderSettings as T[] };
          }
          return { results: [] as T[] };
        },
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO owner_profile")) {
                const existingOwner = state.owner;
                if (
                  existingOwner !== null &&
                  existingOwner.id === values[0] &&
                  sql.includes("username = COALESCE(owner_profile.username")
                ) {
                  state.owner = {
                    id: existingOwner.id,
                    email: values[1] as string | null,
                    name: values[2] as string | null,
                    username: existingOwner.username || (values[3] as string | null),
                    bio: existingOwner.bio,
                    avatar_url: existingOwner.avatar_url,
                    timezone: existingOwner.timezone,
                    locale: existingOwner.locale,
                    password_hash: existingOwner.password_hash,
                  };
                } else {
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

              if (sql.includes("DELETE FROM install_secrets")) {
                state.installSecrets.delete(values[0] as string);
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

              if (sql.includes("INSERT INTO social_provider_settings")) {
                const existingIndex = state.socialProviderSettings.findIndex(
                  (setting) =>
                    setting.user_id === values[0] && setting.provider_id === values[1],
                );
                const existing =
                  existingIndex >= 0 ? state.socialProviderSettings[existingIndex] : null;
                const setting: StoredSocialProviderSetting = {
                  user_id: values[0] as string,
                  provider_id: values[1] as string,
                  client_id: values[2] as string,
                  encrypted_client_secret: values[3] as string | null,
                  secret_hint: values[4] as string | null,
                  secret_updated_at: values[5] as string | null,
                  enabled: values[6] as number,
                  created_at: existing?.created_at || (values[7] as string),
                  updated_at: values[8] as string,
                };
                if (existingIndex >= 0) {
                  state.socialProviderSettings[existingIndex] = setting;
                } else {
                  state.socialProviderSettings.push(setting);
                }
              }

              if (sql.includes("INSERT INTO social_oauth_states")) {
                state.socialOauthStates.push({
                  id: values[0] as string,
                  state: values[1] as string,
                  user_id: values[2] as string,
                  site_id: values[3] as string,
                  platform: values[4] as StoredSocialOauthState["platform"],
                  return_path: values[5] as string,
                  code_verifier: values[6] as string | null,
                  expires_at: values[7] as string,
                  created_at: "2026-05-11T10:00:00Z",
                });
              }

              if (sql.includes("DELETE FROM social_oauth_states")) {
                state.socialOauthStates = state.socialOauthStates.filter(
                  (oauthState) => oauthState.id !== values[0],
                );
              }

              if (sql.includes("INSERT INTO me3_install_claim_states")) {
                const existingIndex = state.me3ClaimStates.findIndex(
                  (entry) => entry.state === values[0],
                );
                const entry: StoredMe3ClaimState = {
                  state: values[0] as string,
                  redirect_path: values[1] as string | null,
                  expires_at: values[2] as string,
                };
                if (existingIndex >= 0) {
                  state.me3ClaimStates[existingIndex] = entry;
                } else {
                  state.me3ClaimStates.push(entry);
                }
              }

              if (sql.includes("DELETE FROM me3_install_claim_states")) {
                state.me3ClaimStates = state.me3ClaimStates.filter(
                  (entry) => entry.state !== values[0],
                );
              }

              if (sql.includes("INSERT INTO social_accounts")) {
                const existingIndex = state.socialAccounts.findIndex(
                  (account) =>
                    account.site_id === values[2] &&
                    account.platform === values[3] &&
                    account.platform_account_id === values[4],
                );
                const existing =
                  existingIndex >= 0 ? state.socialAccounts[existingIndex] : null;
                const account: StoredSocialAccount = {
                  id: existing?.id || (values[0] as string),
                  user_id: values[1] as string,
                  site_id: values[2] as string,
                  platform: values[3] as StoredSocialAccount["platform"],
                  platform_account_id: values[4] as string,
                  platform_handle: values[5] as string | null,
                  display_name: values[6] as string | null,
                  access_token_ciphertext: values[7] as string,
                  refresh_token_ciphertext: values[8] as string | null,
                  token_expires_at: values[9] as string | null,
                  scopes_json: values[10] as string,
                  status: "active",
                  metadata_json: values[11] as string | null,
                  last_verified_at: values[12] as string | null,
                  created_at: existing?.created_at || (values[13] as string),
                  updated_at: values[14] as string,
                };
                if (existingIndex >= 0) {
                  state.socialAccounts[existingIndex] = account;
                } else {
                  state.socialAccounts.push(account);
                }
              }

              if (sql.includes("INSERT INTO content_bank_items")) {
                state.contentItems.push({
                  id: values[0] as string,
                  site_id: values[1] as string,
                  site_username: "owner",
                  user_id: values[2] as string,
                  body: values[3] as string,
                  media_manifest_json: values[4] as string,
                  platforms_json: values[5] as string,
                  source_type: "original",
                  source_ref: null,
                  status: "bank",
                  queue_position: null,
                  scheduled_for: null,
                  timezone: values[6] as string | null,
                  notes: values[7] as string | null,
                  evergreen: values[8] as number,
                  tags_json: values[9] as string,
                  approved_by_human: 1,
                  created_by: "human",
                  times_posted: 0,
                  last_posted_at: null,
                  cooldown_days: 30,
                  created_at: "2026-05-12T09:00:00Z",
                  updated_at: "2026-05-12T09:00:00Z",
                });
              }

              if (sql.includes("UPDATE content_bank_items")) {
                const resequence = sql.includes("WHERE id = ? AND user_id = ? AND site_id = ?");
                const id = (resequence ? values[1] : values[values.length - 2]) as string;
                const userId = (resequence ? values[2] : values[values.length - 1]) as string;
                const item = state.contentItems.find(
                  (entry) => entry.id === id && entry.user_id === userId,
                );
                if (item) {
                  if (resequence) {
                    item.queue_position = values[0] as number;
                    item.updated_at = "2026-05-12T09:05:00Z";
                    return { success: true };
                  }
                  if (sql.includes("status = ?")) {
                    item.status = values[0] as StoredContentItem["status"];
                    item.queue_position = values[1] as number | null;
                    item.scheduled_for = null;
                  }
                  if (sql.includes("body = ?")) item.body = values[0] as string;
                  item.approved_by_human = 1;
                  item.updated_at = "2026-05-12T09:05:00Z";
                }
              }

              if (sql.includes("DELETE FROM content_bank_items")) {
                state.contentItems = state.contentItems.filter(
                  (entry) => !(entry.id === values[0] && entry.user_id === values[1]),
                );
              }

              if (sql.includes("INSERT INTO install_secrets")) {
                state.installSecrets.set(values[0] as string, values[1] as string);
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

              if (sql.includes("INSERT INTO user_reminders")) {
                state.reminders.push({
                  id: values[0] as string,
                  user_id: values[1] as string,
                  title: values[2] as string,
                  notes: values[3] as string | null,
                  remind_at: values[4] as string,
                  timezone: values[5] as string | null,
                  recurrence_rule: values[6] as string | null,
                  context_type: null,
                  context_id: null,
                  context_label: null,
                  status: "pending",
                  delivered_at: null,
                  dismissed_at: null,
                  created_at: "2026-05-13T20:00:00Z",
                });
              }

              if (sql.includes("INSERT INTO contacts")) {
                state.contacts.push({
                  id: values[0] as string,
                  user_id: values[1] as string,
                  name: values[2] as string,
                  email: values[3] as string | null,
                  phone: values[4] as string | null,
                  source: values[5] as DbContact["source"],
                  source_ref: values[6] as string | null,
                  relationship: values[7] as DbContact["relationship"],
                  status: values[8] as DbContact["status"],
                  notes: values[9] as string | null,
                  tags: values[10] as string | null,
                  last_interaction_at: values[11] as string | null,
                  next_followup_at: values[12] as string | null,
                  outreach_status: values[13] as DbContact["outreach_status"],
                  social_handles: values[14] as string | null,
                  metadata: values[15] as string | null,
                  created_at: "2026-05-13T20:10:00Z",
                  updated_at: "2026-05-13T20:10:00Z",
                  booking_count: 0,
                  last_booking_at: null,
                });
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
                const connection: StoredTelegramConnection = {
                  id: sql.includes("'sandbox'")
                    ? (values[0] as string)
                    : ((state.telegramConnection?.id || values[0]) as string),
                  user_id: values[1] as string,
                  channel: sql.includes("'sandbox'") ? "sandbox" : "telegram",
                  status: sql.includes("'sandbox'") ? "active" : "pending",
                  setup_token: values[2] as string,
                  telegram_user_id: null,
                  telegram_chat_id: null,
                  telegram_username: null,
                  telegram_first_name: null,
                  telegram_last_name: null,
                  connected_at: sql.includes("'sandbox'")
                    ? "2026-05-11T10:00:00Z"
                    : null,
                  disconnected_at: null,
                  last_inbound_at: null,
                  last_outbound_at: null,
                  created_at: "2026-05-11T10:00:00Z",
                  updated_at: "2026-05-11T10:00:00Z",
                };
                if (connection.channel === "sandbox") {
                  state.sandboxConnection = connection;
                } else {
                  state.telegramConnection = connection;
                }
              }

              if (sql.includes("UPDATE agent_channel_connections") && state.telegramConnection) {
                if (sql.includes("status = 'active'") && state.sandboxConnection) {
                  state.sandboxConnection = {
                    ...state.sandboxConnection,
                    status: "active",
                    updated_at: "2026-05-11T10:05:00Z",
                  };
                } else {
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
              }

              if (sql.includes("INSERT INTO agent_channel_events")) {
                state.agentEvents.push({
                  id: values[0] as string,
                  connection_id: values[1] as string,
                  channel: sql.includes("'sandbox'") ? "sandbox" : "telegram",
                  direction: "inbound",
                  event_type: "message",
                  status: "received",
                  reply_to_message_id: values[2] as string | null,
                  text_body: values[3] as string | null,
                  raw_json: values[4] as string | null,
                });
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

              if (sql.includes("SELECT id, password_hash FROM owner_profile")) {
                return state.owner
                  ? ({ id: state.owner.id, password_hash: state.owner.password_hash } as T)
                  : null;
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
                if (sql.includes("channel = 'sandbox'")) {
                  return state.sandboxConnection &&
                    values[0] === state.sandboxConnection.user_id
                    ? (state.sandboxConnection as T)
                    : null;
                }
                return state.telegramConnection &&
                  values[0] === state.telegramConnection.user_id
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
              if (sql.includes("FROM content_bank_items")) {
                if (sql.includes("SUM(CASE")) {
                  const userId = values[0] as string;
                  const siteId = values[1] as string;
                  const rows = state.contentItems.filter(
                    (item) => item.user_id === userId && item.site_id === siteId,
                  );
                  return {
                    bank_count: rows.filter((item) => item.status === "bank").length,
                    queued_count: rows.filter(
                      (item) => item.status === "queued" || item.status === "scheduled",
                    ).length,
                    posted_count: rows.filter((item) => item.status === "posted").length,
                    next_scheduled_at: null,
                  } as T;
                }
                return (
                  state.contentItems.find(
                    (item) => item.id === values[0] && item.user_id === values[1],
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM sites")) {
                return values[0] === "site-1" && values[1] === "owner"
                  ? ({ id: "site-1", user_id: "owner", username: "owner" } as T)
                  : null;
              }
              if (sql.includes("FROM social_provider_settings")) {
                return (
                  state.socialProviderSettings.find(
                    (setting) =>
                      setting.user_id === values[0] && setting.provider_id === values[1],
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM social_oauth_states")) {
                return (
                  state.socialOauthStates.find(
                    (oauthState) =>
                      oauthState.state === values[0] && oauthState.platform === values[1],
                  ) || null
                ) as T | null;
              }
              if (sql.includes("FROM me3_install_claim_states")) {
                return (
                  state.me3ClaimStates.find((entry) => entry.state === values[0]) || null
                ) as T | null;
              }
              if (sql.includes("FROM install_secrets")) {
                const value = state.installSecrets.get(values[0] as string);
                return value ? ({ value } as T) : null;
              }
              if (sql.includes("FROM contacts")) {
                return (
                  state.contacts.find(
                    (contact) => contact.user_id === values[0] && contact.id === values[1],
                  ) || null
                ) as T | null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM contacts")) {
                return {
                  results: state.contacts.filter(
                    (contact) => contact.user_id === values[0],
                  ) as T[],
                };
              }
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
              if (sql.includes("FROM social_provider_settings")) {
                return {
                  results: state.socialProviderSettings.filter(
                    (setting) => setting.user_id === values[0],
                  ) as T[],
                };
              }
              if (sql.includes("FROM content_bank_items")) {
                if (sql.includes("status IN ('queued', 'scheduled')")) {
                  return {
                    results: state.contentItems
                      .filter(
                        (item) =>
                          item.user_id === values[0] &&
                          item.site_id === values[1] &&
                          (item.status === "queued" || item.status === "scheduled"),
                      )
                      .sort(
                        (a, b) =>
                          (a.queue_position || Number.MAX_SAFE_INTEGER) -
                          (b.queue_position || Number.MAX_SAFE_INTEGER),
                      ) as T[],
                  };
                }
                return {
                  results: state.contentItems.filter((item) => {
                    const status = values[2] as string | null;
                    return (
                      item.user_id === values[0] &&
                      item.site_id === values[1] &&
                      (!status || item.status === status)
                    );
                  }) as T[],
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
    get reminders() {
      return state.reminders;
    },
    get contacts() {
      return state.contacts;
    },
    get telegramConnection() {
      return state.telegramConnection;
    },
    set telegramConnection(value: StoredTelegramConnection | null) {
      state.telegramConnection = value;
    },
    get sandboxConnection() {
      return state.sandboxConnection;
    },
    get agentEvents() {
      return state.agentEvents;
    },
    get socialAccounts() {
      return state.socialAccounts;
    },
    get socialProviderSettings() {
      return state.socialProviderSettings;
    },
    get socialOauthStates() {
      return state.socialOauthStates;
    },
    get me3ClaimStates() {
      return state.me3ClaimStates;
    },
    get contentItems() {
      return state.contentItems;
    },
    DB: db as unknown as D1Database,
    ENVIRONMENT: "local",
    CORE_WEB_ORIGIN: "http://localhost:4000",
    CORE_API_ORIGIN: "http://localhost:8787",
    JWT_SECRET: "test-secret-at-least-long-enough",
    TOKEN_ENCRYPTION_KEY: "test-encryption-key",
    SETUP_PASSWORD: "owner-code",
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
      headers: { "Content-Type": "application/json", Origin: "http://localhost:4000" },
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

function createFakeSmtpConnect(): {
  connect: NonNullable<Env["SMTP_CONNECT"]>;
  commands: string[];
  messages: string[];
} {
  const commands: string[] = [];
  const messages: string[] = [];
  return {
    commands,
    messages,
    connect: () => new FakeSmtpSocket(commands, messages, true),
  };
}

class FakeSmtpSocket implements Socket {
  readonly opened = Promise.resolve({});
  readonly closed = Promise.resolve();
  readonly upgraded = false;
  readonly secureTransport = "starttls";
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private buffer = "";
  private dataMode = false;

  constructor(
    private readonly commands: string[],
    private readonly messages: string[],
    greet: boolean,
  ) {
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        if (greet) this.enqueue("220 smtp.test ESMTP\r\n");
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.handleWrite(new TextDecoder().decode(chunk));
      },
    });
  }

  async close(): Promise<void> {
    try {
      this.controller?.close();
    } catch {
      // Already closed.
    }
  }

  startTls(): Socket {
    return new FakeSmtpSocket(this.commands, this.messages, false);
  }

  private handleWrite(text: string) {
    this.buffer += text;
    if (this.dataMode) {
      const terminatorIndex = this.buffer.indexOf("\r\n.\r\n");
      if (terminatorIndex < 0) return;
      this.messages.push(this.buffer.slice(0, terminatorIndex));
      this.commands.push("[DATA]");
      this.buffer = this.buffer.slice(terminatorIndex + 5);
      this.dataMode = false;
      this.enqueue("250 2.0.0 Ok: queued as smtp-test-1\r\n");
    }

    while (!this.dataMode) {
      const newlineIndex = this.buffer.indexOf("\r\n");
      if (newlineIndex < 0) return;
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 2);
      this.handleCommand(line);
    }
  }

  private handleCommand(line: string) {
    this.commands.push(line);
    if (line.startsWith("EHLO ")) {
      this.enqueue("250-smtp.test\r\n250-STARTTLS\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
      return;
    }
    if (line === "STARTTLS") {
      this.enqueue("220 2.0.0 Ready to start TLS\r\n");
      return;
    }
    if (line.startsWith("AUTH PLAIN ")) {
      this.enqueue("235 2.7.0 Authentication successful\r\n");
      return;
    }
    if (line.startsWith("MAIL FROM:")) {
      this.enqueue("250 2.1.0 Sender OK\r\n");
      return;
    }
    if (line.startsWith("RCPT TO:")) {
      this.enqueue("250 2.1.5 Recipient OK\r\n");
      return;
    }
    if (line === "DATA") {
      this.dataMode = true;
      this.enqueue("354 End data with <CR><LF>.<CR><LF>\r\n");
      return;
    }
    if (line === "QUIT") {
      this.enqueue("221 2.0.0 Bye\r\n");
      return;
    }
    this.enqueue("250 OK\r\n");
  }

  private enqueue(value: string) {
    this.controller?.enqueue(new TextEncoder().encode(value));
  }
}

async function createSignedMe3ClaimToken(input: {
  issuer: string;
  state: string;
  coreOrigin: string;
  callbackUrl: string;
  email: string;
  handle?: string | null;
}): Promise<{ token: string; publicJwk: JsonWebKey & { kid?: string; alg?: string; use?: string } }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    kid?: string;
    alg?: string;
    use?: string;
  };
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "test-key" };
  const payload: Record<string, unknown> = {
    iss: input.issuer,
    sub: "user123",
    aud: "me3-core-install-claim",
    email: input.email,
    core_origin: input.coreOrigin,
    callback_url: input.callbackUrl,
    state: input.state,
    redirect_path: "/account",
    claim_id: "claim-123",
    iat: now,
    exp: now + 600,
  };
  if (input.handle !== null) {
    payload.handle = input.handle || "kieran";
  }
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return {
    token: `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`,
    publicJwk,
  };
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("ME3 Core Worker auth", () => {
  it("bootstraps the owner and sets an httpOnly session cookie", async () => {
    const env = createEnv();

    const response = await bootstrap(env);
    const body = (await response.json()) as { ok: boolean; owner: OwnerProfile };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.owner.email).toBe("owner@example.com");
    expect(env.owner?.password_hash?.split("$")[1]).toBe("100000");
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

  it("generates a persistent owner session secret when no env JWT secret is provided", async () => {
    const env = createEnv();
    env.JWT_SECRET = undefined;

    const response = await bootstrap(env);
    const session = cookieHeader(response);
    const meResponse = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        headers: { Cookie: session },
      }),
      env,
    );
    const configResponse = await app.fetch(new Request("http://localhost/api/config"), env);
    const config = (await configResponse.json()) as { setupRequired: string[] };

    expect(response.status).toBe(200);
    expect(meResponse.status).toBe(200);
    expect(env.installSecrets.get("JWT_SECRET")).toMatch(/^[a-f0-9]{64}$/);
    expect(config.setupRequired).not.toContain("JWT_SECRET");
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

  it("does not treat a placeholder owner row as configured auth", async () => {
    const env = createEnv();
    env.owner = {
      id: "owner",
      email: null,
      name: null,
      username: "owner",
      bio: null,
      avatar_url: null,
      timezone: null,
      locale: null,
      password_hash: null,
    };

    const response = await app.fetch(new Request("http://localhost/api/config"), env);
    const config = (await response.json()) as {
      ownerAuthConfigured: boolean;
      ownerPasswordAuthConfigured: boolean;
      ownerMe3AuthConfigured: boolean;
    };

    expect(config).toMatchObject({
      ownerAuthConfigured: false,
      ownerPasswordAuthConfigured: false,
      ownerMe3AuthConfigured: false,
    });
  });

  it("starts ME3 Cloud install claim for unclaimed installs", async () => {
    const env = createEnv();
    env.ME3_CLOUD_ORIGIN = "https://me3.example";

    const response = await app.fetch(
      new Request("https://core.example/api/auth/me3/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect: "/account" }),
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; url: string; state: string };
    const claimUrl = new URL(body.url);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state).toMatch(/[0-9a-f-]{36}/);
    expect(claimUrl.origin).toBe("https://me3.example");
    expect(claimUrl.pathname).toBe("/core/claim");
    expect(claimUrl.searchParams.get("core_origin")).toBe("http://localhost:4000");
    expect(claimUrl.searchParams.get("callback_url")).toBe(
      "http://localhost:8787/api/auth/me3/callback",
    );
    expect(claimUrl.searchParams.get("redirect")).toBe("/account");
  });

  it("accepts a verified ME3 Cloud install claim callback", async () => {
    const env = createEnv();
    env.TOKEN_ENCRYPTION_KEY = undefined;
    env.ME3_CLOUD_ORIGIN = "https://me3.example";
    env.ME3_CLOUD_API_ORIGIN = "https://api.me3.example";

    const startResponse = await app.fetch(
      new Request("https://core.example/api/auth/me3/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect: "/account" }),
      }),
      env,
    );
    const startBody = (await startResponse.json()) as { state: string };
    const signedClaim = await createSignedMe3ClaimToken({
      issuer: "https://api.me3.example",
      state: startBody.state,
      coreOrigin: "http://localhost:4000",
      callbackUrl: "http://localhost:8787/api/auth/me3/callback",
      email: "owner@example.com",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [signedClaim.publicJwk] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const callbackResponse = await app.fetch(
      new Request(
        `http://localhost:8787/api/auth/me3/callback?state=${encodeURIComponent(
          startBody.state,
        )}&claim_token=${encodeURIComponent(signedClaim.token)}`,
      ),
      env,
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/account");
    expect(cookieHeader(callbackResponse)).toMatch(/^me3_core_session=/);
    expect(env.owner).toMatchObject({
      id: "owner",
      email: "owner@example.com",
      username: "kieran",
      password_hash: null,
    });
    expect(env.installSecrets.get("ME3_CLOUD_OWNER_ID")).toBe("user123");
    expect(env.installSecrets.get("TOKEN_ENCRYPTION_KEY")).toMatch(/^[a-f0-9]{64}$/);
    expect(env.me3ClaimStates).toHaveLength(0);

    fetchMock.mockRestore();
  });

  it("rejects ME3 Cloud install claim callbacks without a valid handle", async () => {
    const env = createEnv();
    env.ME3_CLOUD_ORIGIN = "https://me3.example";
    env.ME3_CLOUD_API_ORIGIN = "https://api.me3.example";

    const startResponse = await app.fetch(
      new Request("https://core.example/api/auth/me3/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirect: "/account" }),
      }),
      env,
    );
    const startBody = (await startResponse.json()) as { state: string };
    const signedClaim = await createSignedMe3ClaimToken({
      issuer: "https://api.me3.example",
      state: startBody.state,
      coreOrigin: "http://localhost:4000",
      callbackUrl: "http://localhost:8787/api/auth/me3/callback",
      email: "owner@example.com",
      handle: null,
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [signedClaim.publicJwk] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const callbackResponse = await app.fetch(
      new Request(
        `http://localhost:8787/api/auth/me3/callback?state=${encodeURIComponent(
          startBody.state,
        )}&claim_token=${encodeURIComponent(signedClaim.token)}`,
      ),
      env,
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toContain(
      "me3_claim_error=claim_mismatch",
    );
    expect(env.owner).toBeNull();

    fetchMock.mockRestore();
  });

  it("lets a password owner start a protected ME3 app connection link", async () => {
    const env = createEnv();
    env.ME3_CLOUD_ORIGIN = "https://me3.example";
    const session = cookieHeader(await bootstrap(env));

    const publicStartResponse = await app.fetch(
      new Request("https://core.example/api/auth/me3/start", {
        method: "POST",
      }),
      env,
    );
    expect(publicStartResponse.status).toBe(409);

    const response = await app.fetch(
      new Request("https://core.example/api/account/app-connections/me3/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ redirect: "/account?section=connections" }),
      }),
      env,
    );
    const body = (await response.json()) as { ok: boolean; url: string; state: string };
    const claimUrl = new URL(body.url);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(claimUrl.origin).toBe("https://me3.example");
    expect(claimUrl.searchParams.get("redirect")).toBe("/account?section=connections");
    expect(env.me3ClaimStates).toHaveLength(1);
  });

  it("links ME3 app auth without removing the existing password login", async () => {
    const env = createEnv();
    env.ME3_CLOUD_ORIGIN = "https://me3.example";
    env.ME3_CLOUD_API_ORIGIN = "https://api.me3.example";
    const session = cookieHeader(await bootstrap(env));
    const passwordHash = env.owner?.password_hash;

    const startResponse = await app.fetch(
      new Request("https://core.example/api/account/app-connections/me3/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ redirect: "/account?section=connections" }),
      }),
      env,
    );
    const startBody = (await startResponse.json()) as { state: string };
    const signedClaim = await createSignedMe3ClaimToken({
      issuer: "https://api.me3.example",
      state: startBody.state,
      coreOrigin: "http://localhost:4000",
      callbackUrl: "http://localhost:8787/api/auth/me3/callback",
      email: "owner@example.com",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ keys: [signedClaim.publicJwk] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const callbackResponse = await app.fetch(
      new Request(
        `http://localhost:8787/api/auth/me3/callback?state=${encodeURIComponent(
          startBody.state,
        )}&claim_token=${encodeURIComponent(signedClaim.token)}`,
      ),
      env,
    );
    const configResponse = await app.fetch(new Request("http://localhost/api/config"), env);
    const config = (await configResponse.json()) as {
      ownerPasswordAuthConfigured: boolean;
      ownerMe3AuthConfigured: boolean;
    };

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/account?section=connections");
    expect(env.owner?.password_hash).toBe(passwordHash);
    expect(env.installSecrets.get("ME3_CLOUD_OWNER_ID")).toBe("user123");
    expect(config).toMatchObject({
      ownerPasswordAuthConfigured: true,
      ownerMe3AuthConfigured: true,
    });

    fetchMock.mockRestore();
  });

  it("disconnects ME3 app auth only when password login remains available", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    env.installSecrets.set("ME3_CLOUD_OWNER_ID", "user123");

    const response = await app.fetch(
      new Request("http://localhost/api/account/app-connections/me3", {
        method: "DELETE",
        headers: { Cookie: session },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(env.installSecrets.get("ME3_CLOUD_OWNER_ID")).toBeUndefined();
  });

  it("does not check ME3 Cloud username conflicts before the install is linked", async () => {
    const env = createEnv();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(getMe3CloudUsernamePublishBlockReason(env, "owner")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("blocks Core publishing when ME3 Cloud reports the username is taken", async () => {
    const env = createEnv();
    env.ME3_CLOUD_API_ORIGIN = "https://api.me3.example";
    env.installSecrets.set("ME3_CLOUD_OWNER_ID", "user123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ available: false }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getMe3CloudUsernamePublishBlockReason(env, "owner")).resolves.toBe(
      "This username is already taken on ME3 Cloud. Choose another handle before publishing.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.me3.example/api/usernames/owner/available",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-ME3-Core-Owner-ID": "user123",
        }),
      }),
    );

    fetchMock.mockRestore();
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

  it("dispatches owner sandbox chat turns through the agent runtime", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const runtimeCalls: Array<[string, RequestInit]> = [];
    const runtimeFetch = vi.fn(async (url: string, init?: RequestInit) => {
      runtimeCalls.push([url, init || {}]);
      return Response.json({
        ok: true,
        auditId: null,
        turnId: "turn-1",
        specialist: "core.agent-chat",
        replyText: "Hello from Core chat.",
        model: "test-model",
        source: "fallback",
        fallbackReason: null,
        debugError: null,
        emailAction: null,
        reminderAction: null,
        contentAction: null,
        contactsChanged: false,
      });
    });

    env.ME3_USER_AGENT = {
      idFromName: vi.fn((name: string) => name),
      get: vi.fn(() => ({ fetch: runtimeFetch })),
    } as unknown as DurableObjectNamespace;

    const response = await app.fetch(
      new Request("http://localhost/api/agent/sandbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ messageText: "Hello agent" }),
      }),
      env,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      specialist: "core.agent-chat",
      replyText: "Hello from Core chat.",
    });
    expect(env.agentEvents).toHaveLength(1);
    expect(env.agentEvents[0]).toMatchObject({
      channel: "sandbox",
      direction: "inbound",
      text_body: "Hello agent",
    });
    expect(runtimeFetch).toHaveBeenCalledOnce();
    const runtimeInit = runtimeCalls[0]?.[1] || {};
    expect(JSON.parse(String(runtimeInit.body))).toMatchObject({
      userId: "owner",
      messageText: "Hello agent",
    });
  });

  it("blocks sandbox chat turns when the Agent Chat plugin is disabled", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/plugins/me3.agent-chat/deactivate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    const response = await app.fetch(
      new Request("http://localhost/api/agent/sandbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ messageText: "Hello agent" }),
      }),
      env,
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      error: "Agent Chat plugin is disabled",
    });
    expect(env.agentEvents).toHaveLength(0);
  });

  it("creates owner reminders through the agent chat package surface", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/agent/reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          title: "Follow up with Sam",
          notes: "Ask about the proposal",
          date: "2026-05-20",
          time: "09:30",
          timezone: "Europe/Dublin",
          recurrence: "weekly",
        }),
      }),
      env,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      reminder: {
        title: "Follow up with Sam",
        notes: "Ask about the proposal",
        timezone: "Europe/Dublin",
        recurrenceRule: "weekly:wed",
        status: "pending",
      },
    });
    expect(env.reminders).toHaveLength(1);
    expect(env.reminders[0]).toMatchObject({
      user_id: "owner",
      title: "Follow up with Sam",
      recurrence_rule: "weekly:wed",
    });
  });

  it("creates owner contacts through the agent chat package surface", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          name: "Sam Client",
          email: "SAM@EXAMPLE.COM",
          relationship: "prospect",
          tags: ["proposal"],
          closeness: "close",
          socialHandles: { linkedin: "sam-client" },
        }),
      }),
      env,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      ok: true,
      contact: {
        name: "Sam Client",
        email: "sam@example.com",
        relationship: "prospect",
        status: "active",
        closeness: "close",
        tags: ["proposal"],
        socialHandles: { linkedin: "sam-client" },
      },
    });
    expect(env.contacts).toHaveLength(1);
    expect(env.contacts[0]).toMatchObject({
      user_id: "owner",
      name: "Sam Client",
      email: "sam@example.com",
      relationship: "prospect",
    });
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
        installed: boolean;
        enabled: boolean;
        implementationStatus: string;
        releaseStage: string;
        activationAllowed: boolean;
        agentTools: Array<{ id: string; approvalMode: string }>;
        setupRequirements: Array<{ kind: string; configured: boolean; required: boolean }>;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(body.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "me3.agent-chat",
          status: "installed",
          implementationStatus: "bundled",
        }),
        expect.objectContaining({
          id: "me3.calendar",
          status: "available",
          implementationStatus: "bundled",
        }),
        expect.objectContaining({
          id: "me3.social-publishing",
          status: "available",
          implementationStatus: "bundled",
        }),
        expect.objectContaining({
          id: "me3.landing-pages",
          status: "coming_soon",
          implementationStatus: "bundled",
          releaseStage: "coming_soon",
          activationAllowed: false,
          enabled: false,
        }),
      ]),
    );
    const socialPlugin = body.plugins.find(
      (plugin) => plugin.id === "me3.social-publishing",
    );
    const agentChatPlugin = body.plugins.find((plugin) => plugin.id === "me3.agent-chat");
    const calendarPlugin = body.plugins.find((plugin) => plugin.id === "me3.calendar");
    expect(agentChatPlugin).toMatchObject({
      status: "installed",
      installed: true,
      enabled: true,
    });
    expect(agentChatPlugin?.setupRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "migration",
          configured: true,
          required: true,
        }),
      ]),
    );
    expect(calendarPlugin?.agentTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "calendar.event.create",
          approvalMode: "approval_required",
        }),
      ]),
    );
    expect(socialPlugin?.agentTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "content.publish",
          approvalMode: "approval_required",
        }),
      ]),
    );
    expect(socialPlugin?.setupRequirements).toEqual(
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

  it("keeps shared ME3 knowledge aligned with plugin manifest tools", () => {
    expect(validateMe3KnowledgeAgainstPlugins(CORE_PLUGIN_CATALOG)).toEqual([]);
  });

  it("requires owner auth for plugin catalog access", async () => {
    const env = createEnv();

    const response = await app.fetch(new Request("http://localhost/api/plugins"), env);

    expect(response.status).toBe(401);
  });

  it("exposes shared ME3 knowledge with runtime setup state", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/knowledge", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      schemaVersion: string;
      catalogVersion: string;
      facts: Array<{ id: string }>;
      capabilities: Array<{ id: string; runtimeState: string; runtimeNote: string }>;
      plugins: Array<{ id: string; routePaths: string[]; agentToolIds: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(body.catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.v\d+$/);
    expect(body.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "me3.boundary.public_private" }),
      ]),
    );
    expect(body.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "workspace.mission_control",
          runtimeState: "available",
        }),
        expect.objectContaining({
          id: "calendar.events_reminders",
          runtimeState: "available",
        }),
        expect.objectContaining({
          id: "content.social_publishing",
          runtimeState: "setup_required",
        }),
        expect.objectContaining({
          id: "ai.chat_provider",
          runtimeState: "setup_required",
        }),
      ]),
    );
    expect(body.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "me3.mission-control",
          routePaths: expect.arrayContaining(["/api/mission-control/overview"]),
          agentToolIds: expect.arrayContaining(["mission.task.create"]),
        }),
      ]),
    );
  });

  it("requires owner auth for ME3 knowledge access", async () => {
    const env = createEnv();

    const response = await app.fetch(new Request("http://localhost/api/knowledge"), env);

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

    expect(catalog.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "me3.social-publishing",
          status: "installed",
        }),
      ]),
    );
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

  it("creates and queues Social Publishing content items when installed", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    const createResponse = await app.fetch(
      new Request("http://localhost/api/content/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          siteId: "site-1",
          body: "A useful small post for the content bank.",
          platforms: ["linkedin"],
        }),
      }),
      env,
    );
    const createBody = (await createResponse.json()) as {
      item: { id: string; body: string; status: string; platforms: string[] };
    };

    expect(createResponse.status).toBe(201);
    expect(createBody.item).toMatchObject({
      body: "A useful small post for the content bank.",
      status: "bank",
      platforms: ["linkedin"],
    });

    const queueResponse = await app.fetch(
      new Request(`http://localhost/api/content/items/${createBody.item.id}/queue`, {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const queueBody = (await queueResponse.json()) as {
      item: { status: string; queuePosition: number };
    };

    expect(queueResponse.status).toBe(200);
    expect(queueBody.item).toMatchObject({ status: "queued", queuePosition: 1 });

    const listResponse = await app.fetch(
      new Request("http://localhost/api/content/items?siteId=site-1", {
        headers: { Cookie: session },
      }),
      env,
    );
    const listBody = (await listResponse.json()) as {
      items: Array<{ id: string; status: string }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listBody.items).toEqual([
      expect.objectContaining({ id: createBody.item.id, status: "queued" }),
    ]);
  });

  it("gates Social Publishing content items when disabled", async () => {
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
      new Request("http://localhost/api/content/items?siteId=site-1", {
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as {
      error: string;
      plugin: { status: string; ready: boolean };
    };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Social Publishing is disabled");
    expect(body.plugin).toMatchObject({ status: "disabled", ready: false });
  });

  it("stores Social Publishing provider settings without returning secrets", async () => {
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
      new Request("http://localhost/api/social/provider-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          providers: [
            {
              id: "linkedin",
              clientId: "linkedin-client",
              clientSecret: "linkedin-secret-1234",
              enabled: true,
            },
          ],
        }),
      }),
      env,
    );
    const body = (await response.json()) as {
      providers: Array<{ providerId: string; configured: boolean; secretHint: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: "linkedin",
          configured: true,
          secretHint: "***1234",
        }),
      ]),
    );
    expect(JSON.stringify(body)).not.toContain("linkedin-secret-1234");
    expect(env.socialProviderSettings[0].encrypted_client_secret).toMatch(/^v1\./);
    expect(env.socialProviderSettings[0].encrypted_client_secret).not.toContain(
      "linkedin-secret-1234",
    );
  });

  it("rejects Social Publishing OAuth start when provider secrets are missing", async () => {
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
      new Request("http://localhost/api/social/linkedin/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ siteId: "site-1" }),
      }),
      env,
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(424);
    expect(body.error).toBe("LinkedIn integration is not configured");
  });

  it("starts hosted Social Publishing OAuth without provider secrets", async () => {
    const env = createEnv();
    env.ME3_SOCIAL_OAUTH_ORIGIN = "https://social-oauth.example";
    const session = cookieHeader(await bootstrap(env));
    await app.fetch(
      new Request("http://localhost/api/plugins/me3.social-publishing/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );

    const response = await app.fetch(
      new Request("http://localhost/api/social/linkedin/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ siteId: "site-1", returnPath: "/social" }),
      }),
      env,
    );
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);

    expect(response.status).toBe(200);
    expect(url.origin).toBe("https://social-oauth.example");
    expect(url.pathname).toBe("/api/social/linkedin/authorize");
    expect(url.searchParams.get("core_callback")).toBe(
      "http://localhost:8787/api/social/linkedin/callback",
    );
    expect(env.socialOauthStates).toHaveLength(1);
  });

  it("gates Social Publishing OAuth start when disabled", async () => {
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
      new Request("http://localhost/api/social/linkedin/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ siteId: "site-1" }),
      }),
      env,
    );
    const body = (await response.json()) as {
      error: string;
      plugin: { status: string; ready: boolean };
    };

    expect(response.status).toBe(403);
    expect(body.error).toBe("Social Publishing is disabled");
    expect(body.plugin).toMatchObject({ status: "disabled", ready: false });
  });

  it("starts LinkedIn OAuth and connects a social account from callback state", async () => {
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
      new Request("http://localhost/api/social/provider-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          providers: [
            {
              id: "linkedin",
              clientId: "linkedin-client",
              clientSecret: "linkedin-secret-1234",
              enabled: true,
            },
          ],
        }),
      }),
      env,
    );

    const authorizeResponse = await app.fetch(
      new Request("http://localhost/api/social/linkedin/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({ siteId: "site-1", returnPath: "/social" }),
      }),
      env,
    );
    const authorizeBody = (await authorizeResponse.json()) as { url: string };
    const authorizeUrl = new URL(authorizeBody.url);
    const state = authorizeUrl.searchParams.get("state");

    expect(authorizeResponse.status).toBe(200);
    expect(authorizeUrl.origin).toBe("https://www.linkedin.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("linkedin-client");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8787/api/social/linkedin/callback",
    );
    expect(state).toBeTruthy();
    expect(env.socialOauthStates).toHaveLength(1);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("accessToken")) {
        return new Response(
          JSON.stringify({
            access_token: "linkedin-access-token",
            refresh_token: "linkedin-refresh-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          sub: "linkedin-owner",
          name: "Owner LinkedIn",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const callbackResponse = await app.fetch(
        new Request(
          `http://localhost/api/social/linkedin/callback?code=ok-code&state=${encodeURIComponent(
            state || "",
          )}`,
        ),
        env,
      );

      expect(callbackResponse.status).toBe(302);
      expect(callbackResponse.headers.get("location")).toBe(
        "http://localhost:4000/social?social_connected=linkedin",
      );
      expect(env.socialOauthStates).toHaveLength(0);
      expect(env.socialAccounts).toEqual([
        expect.objectContaining({
          platform: "linkedin",
          platform_account_id: "linkedin-owner",
          display_name: "Owner LinkedIn",
          status: "active",
        }),
      ]);
      expect(env.socialAccounts[0].access_token_ciphertext).toMatch(/^v1\./);
      expect(env.socialAccounts[0].access_token_ciphertext).not.toContain(
        "linkedin-access-token",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects Social Publishing callback with invalid state", async () => {
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
      new Request(
        "http://localhost/api/social/linkedin/callback?code=ok-code&state=missing-state",
      ),
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/social?social_error=state_expired",
    );
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

  it("rejects activation for coming-soon plugins", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/plugins/me3.landing-pages/activate", {
        method: "POST",
        headers: { Cookie: session },
      }),
      env,
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("coming soon");
  });

  it("rejects landing-page site creation while the plugin is coming soon", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));

    const response = await app.fetch(
      new Request("http://localhost/api/sites", {
        method: "POST",
        headers: {
          Cookie: session,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "owner-event",
          siteType: "landing_page",
          templateId: "event",
        }),
      }),
      env,
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(403);
    expect(body.error).toContain("coming soon");
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
          model: "@cf/qwen/qwen3-30b-a3b-fp8",
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

  it("loads SMTP-first email provider settings for the signed-in owner", async () => {
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
    expect(body.activeProviderId).toBe("smtp");
    expect(body.providers[0]).toMatchObject({
      id: "smtp",
      recommended: true,
      stable: true,
    });
    expect(body.providers[0].setupRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "smtp-host",
          label: "SMTP host",
        }),
        expect.objectContaining({
          id: "submission-port",
        }),
      ]),
    );
    expect(body.providers[1]).toMatchObject({
      id: "mailgun",
      recommended: false,
      stable: true,
    });
    expect(body.providers[2]).toMatchObject({
      id: "postmark",
      recommended: false,
      stable: true,
    });
    expect(body.providers[3]).toMatchObject({
      id: "cloudflare-email",
      recommended: false,
    });
    expect(body.futureProviders.map((provider) => provider.id)).not.toContain("mailgun");
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

  it("saves encrypted SMTP sender settings without returning the password", async () => {
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
          activeProviderId: "smtp",
          providers: [
            {
              id: "smtp",
              fromAddress: "hello@example.com",
              fromName: "ME3 Mail",
              smtpHost: "smtp.example.com",
              smtpPort: 587,
              smtpSecurity: "starttls",
              smtpUsername: "smtp-user",
              apiToken: "smtp-password-1234",
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
        config: { smtpHost: string; smtpPort: number; smtpSecurity: string };
      }>;
    };
    const smtp = body.providers.find((provider) => provider.id === "smtp");

    expect(response.status).toBe(200);
    expect(body.activeProviderId).toBe("smtp");
    expect(smtp).toMatchObject({
      configured: true,
      source: "stored",
      keyHint: "***1234",
      config: {
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
      },
    });
    expect(JSON.stringify(body)).not.toContain("smtp-password-1234");
    expect(env.emailProviderSettings[0].encrypted_secret).toMatch(/^v1\./);
    expect(env.emailProviderSettings[0].encrypted_secret).not.toContain(
      "smtp-password-1234",
    );
  });

  it("saves encrypted Mailgun sender settings without returning the API key", async () => {
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
          activeProviderId: "mailgun",
          providers: [
            {
              id: "mailgun",
              fromAddress: "hello@example.com",
              fromName: "ME3 Mail",
              replyToAddress: "reply@example.com",
              sendingDomain: "mg.example.com",
              mailgunRegion: "eu",
              apiToken: "mailgun-secret-1234",
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
        config: {
          fromAddress: string;
          replyToAddress: string;
          sendingDomain: string;
          mailgunRegion: string;
        };
      }>;
    };
    const mailgun = body.providers.find((provider) => provider.id === "mailgun");

    expect(response.status).toBe(200);
    expect(body.activeProviderId).toBe("mailgun");
    expect(mailgun).toMatchObject({
      configured: true,
      source: "stored",
      keyHint: "***1234",
      config: {
        fromAddress: "hello@example.com",
        replyToAddress: "reply@example.com",
        sendingDomain: "mg.example.com",
        mailgunRegion: "eu",
      },
    });
    expect(JSON.stringify(body)).not.toContain("mailgun-secret-1234");
    expect(env.emailProviderSettings[0].encrypted_secret).toMatch(/^v1\./);
    expect(env.emailProviderSettings[0].encrypted_secret).not.toContain(
      "mailgun-secret-1234",
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

  it("sends a Mailgun test message through the provider adapter", async () => {
    const env = createEnv();
    const session = cookieHeader(await bootstrap(env));
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            id: "<mg-test-1@mg.example.com>",
            message: "Queued. Thank you.",
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
            activeProviderId: "mailgun",
            providers: [
              {
                id: "mailgun",
                fromAddress: "owner@example.com",
                fromName: "ME3 Owner",
                replyToAddress: "reply@example.com",
                sendingDomain: "mg.example.com",
                mailgunRegion: "eu",
                apiToken: "mailgun-secret-1234",
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
        providerId: "mailgun",
        providerMessageId: "<mg-test-1@mg.example.com>",
        sentTo: "owner@example.com",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
        "https://api.eu.mailgun.net/v3/mg.example.com/messages",
      );
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).toMatchObject({
        Authorization: `Basic ${btoa("api:mailgun-secret-1234")}`,
      });
      const form = init.body as FormData;
      expect(form.get("from")).toBe("ME3 Owner <owner@example.com>");
      expect(form.get("to")).toBe("owner@example.com");
      expect(form.get("subject")).toBe("ME3 Core test email");
      expect(form.get("text")).toBe(
        "This is a test email from your ME3 Core outbound sender settings.",
      );
      expect(form.get("html")).toBe(
        "<p>This is a test email from your ME3 Core outbound sender settings.</p>",
      );
      expect(form.get("h:Reply-To")).toBe("reply@example.com");
      expect(form.get("h:X-ME3-Provider")).toBe("mailgun");
      expect(env.emailSendAudit).toEqual([
        expect.objectContaining({
          provider_id: "mailgun",
          provider_message_id: "<mg-test-1@mg.example.com>",
          status: "sent",
          purpose: "test",
        }),
      ]);
      expect(env.emailProviderSettings[0]).toMatchObject({
        provider_id: "mailgun",
        last_status: "ready",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends an SMTP test message through the socket adapter", async () => {
    const env = createEnv();
    const smtp = createFakeSmtpConnect();
    env.SMTP_CONNECT = smtp.connect;
    const session = cookieHeader(await bootstrap(env));

    await app.fetch(
      new Request("http://localhost/api/email-provider-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: session,
        },
        body: JSON.stringify({
          activeProviderId: "smtp",
          providers: [
            {
              id: "smtp",
              fromAddress: "owner@example.com",
              fromName: "ME3 Owner",
              smtpHost: "smtp.example.com",
              smtpPort: 587,
              smtpSecurity: "starttls",
              smtpUsername: "smtp-user",
              apiToken: "smtp-password-1234",
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
        body: JSON.stringify({ providerId: "smtp", to: "owner@example.com" }),
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
      providerId: "smtp",
      providerMessageId: "smtp-test-1",
      sentTo: "owner@example.com",
    });
    expect(smtp.commands).toEqual(
      expect.arrayContaining([
        "EHLO example.com",
        "STARTTLS",
        "AUTH PLAIN AHNtdHAtdXNlcgBzbXRwLXBhc3N3b3JkLTEyMzQ=",
        "MAIL FROM:<owner@example.com>",
        "RCPT TO:<owner@example.com>",
        "DATA",
        "[DATA]",
        "QUIT",
      ]),
    );
    expect(smtp.messages[0]).toContain("Subject: ME3 Core test email");
    expect(smtp.messages[0]).toContain("X-ME3-Provider: smtp");
    expect(env.emailSendAudit).toEqual([
      expect.objectContaining({
        provider_id: "smtp",
        provider_message_id: "smtp-test-1",
        status: "sent",
        purpose: "test",
      }),
    ]);
    expect(env.emailProviderSettings[0]).toMatchObject({
      provider_id: "smtp",
      last_status: "ready",
    });
  });

  it("rejects SMTP port 25 because Workers cannot use it for outbound SMTP", async () => {
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
          activeProviderId: "smtp",
          providers: [
            {
              id: "smtp",
              fromAddress: "owner@example.com",
              smtpHost: "smtp.example.com",
              smtpPort: 25,
              smtpSecurity: "starttls",
              smtpUsername: "smtp-user",
              apiToken: "smtp-password-1234",
            },
          ],
        }),
      }),
      env,
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("SMTP port 25 is not supported");
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
