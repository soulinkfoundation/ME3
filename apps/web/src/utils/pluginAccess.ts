import { api } from "../api";

export type PluginAccessRecord = {
  id: string;
  status: string;
  enabled: boolean;
};

type PluginAccessResponse = {
  plugins: PluginAccessRecord[];
};

let cachedPlugins: PluginAccessRecord[] | null = null;
let requestGeneration = 0;
let activeRequest:
  | {
      generation: number;
      promise: Promise<PluginAccessRecord[]>;
    }
  | null = null;

export function invalidatePluginAccess() {
  requestGeneration += 1;
  cachedPlugins = null;
  activeRequest = null;
}

export async function ensurePluginAccess(): Promise<PluginAccessRecord[]> {
  if (cachedPlugins) return cachedPlugins;
  if (activeRequest?.generation === requestGeneration) {
    return activeRequest.promise;
  }

  const generation = requestGeneration;
  const promise = api
    .get<PluginAccessResponse>("/plugins")
    .then((response) => {
      const plugins = response.plugins || [];
      if (generation === requestGeneration) cachedPlugins = plugins;
      return plugins;
    })
    .finally(() => {
      if (activeRequest?.generation === generation) activeRequest = null;
    });
  activeRequest = { generation, promise };
  return promise;
}

export async function isPluginAccessEnabled(
  pluginId: string,
): Promise<boolean> {
  return (await ensurePluginAccess()).some(
    (plugin) =>
      plugin.id === pluginId &&
      plugin.enabled &&
      plugin.status === "installed",
  );
}
