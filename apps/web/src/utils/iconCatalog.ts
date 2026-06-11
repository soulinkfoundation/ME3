import { icons } from "lucide";
import type { IconNode } from "lucide";
import {
  USER_STAR_ICON,
  buildIconMeta,
  resolveUiIconName,
  type LucideIconName,
} from "./icons";

export const CATALOG_ICONS = {
  ...icons,
  UserStar: USER_STAR_ICON,
} as Record<string, IconNode>;

export const CATALOG_ICON_NAMES = Object.keys(CATALOG_ICONS).sort() as LucideIconName[];

export const CATALOG_ICON_META = buildIconMeta(CATALOG_ICON_NAMES) as Record<
  LucideIconName,
  { label: string; keywords: string[] }
>;

export function resolveCatalogIconName(value: string): LucideIconName | null {
  const resolved = resolveUiIconName(value);
  if (resolved && CATALOG_ICONS[resolved]) return resolved;
  return null;
}

export function getCatalogIconNode(name: string): IconNode | null {
  const resolved = resolveCatalogIconName(name);
  return resolved ? CATALOG_ICONS[resolved] || null : null;
}
