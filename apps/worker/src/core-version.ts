import packageJson from "../../../package.json";

export const ME3_CORE_VERSION = packageJson.version;
export const ME3_CORE_RELEASE_CHANNEL = "stable";
export const ME3_CORE_UPDATE_MANIFEST_URL =
  "https://raw.githubusercontent.com/Soulink-Foundation/me3/main/updates/stable.json";
export const ME3_CORE_RELEASE_NOTES_URL = "https://github.com/Soulink-Foundation/me3/releases";

export function getCoreVersionInfo() {
  return {
    version: ME3_CORE_VERSION,
    releaseChannel: ME3_CORE_RELEASE_CHANNEL,
    updateManifestUrl: ME3_CORE_UPDATE_MANIFEST_URL,
    releaseNotesUrl: ME3_CORE_RELEASE_NOTES_URL,
  };
}
