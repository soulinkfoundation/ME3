export const SOCIAL_PUBLISHING_RUNTIME = {
  id: "me3.social-publishing",
  packageName: "@me3-core/plugin-social-publishing",
  bundled: true,
  runtimeStatus: "activation_stub",
  notes: [
    "Core can install, enable, disable, and expose setup state for Social Publishing.",
    "Provider publishing routes, queue consumers, and UI slots still need the extracted plugin runtime.",
  ],
} as const;
