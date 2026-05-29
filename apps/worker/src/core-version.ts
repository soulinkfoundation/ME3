import coreMetadata from "../../../me3-core.json";

export const ME3_CORE_VERSION = coreMetadata.version;
export const ME3_CORE_RELEASE_CHANNEL = coreMetadata.releaseChannel;
export const ME3_CORE_UPDATE_MANIFEST_URL =
  coreMetadata.updateManifestUrl;
export const ME3_CORE_RELEASE_NOTES_URL = coreMetadata.releaseNotesUrl;

export function getCoreVersionInfo() {
  return {
    version: ME3_CORE_VERSION,
    releaseChannel: ME3_CORE_RELEASE_CHANNEL,
    updateManifestUrl: ME3_CORE_UPDATE_MANIFEST_URL,
    releaseNotesUrl: ME3_CORE_RELEASE_NOTES_URL,
  };
}
