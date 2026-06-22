import { ref } from "vue";
import type {
  AgentChatActionCard,
  AgentChatTurnTrace,
} from "../utils/agentChat";

export type AgentChatMessage = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string | null;
  meta?: string | null;
  detail?: string | null;
  actionCards?: AgentChatActionCard[];
  trace?: AgentChatTurnTrace | null;
  jobBuilderAction?: any;
  inboxLink?: boolean;
  rolodexLink?: boolean;
  reminderLink?: boolean;
  actionHref?: string | null;
  actionLabel?: string | null;
};

const defaultMessages = (): AgentChatMessage[] => [
  {
    id: "assistant-ready",
    role: "assistant",
    text: "Ask me to check bookings, draft follow-up emails, manage reminders, update a contact, or help with your site and content.",
    meta: "ME3 ready",
  },
];

const isOpen = ref(false);
const messages = ref<AgentChatMessage[]>(defaultMessages());
const launcherHidden = ref(false);

export function useAgentChat() {
  function openChat() {
    isOpen.value = true;
  }

  function closeChat() {
    isOpen.value = false;
  }

  function toggleChat() {
    isOpen.value = !isOpen.value;
  }

  function hideLauncher() {
    launcherHidden.value = true;
  }

  function showLauncher() {
    launcherHidden.value = false;
  }

  function replaceMessages(next: AgentChatMessage[]) {
    messages.value = next.length > 0 ? [...next] : defaultMessages();
  }

  function appendMessage(message: AgentChatMessage) {
    messages.value.push(message);
  }

  function resetMessages() {
    messages.value = defaultMessages();
  }

  function resetState() {
    isOpen.value = false;
    launcherHidden.value = false;
    messages.value = defaultMessages();
  }

  return {
    isOpen,
    messages,
    launcherHidden,
    openChat,
    closeChat,
    toggleChat,
    hideLauncher,
    showLauncher,
    replaceMessages,
    appendMessage,
    resetMessages,
    resetState,
  };
}
