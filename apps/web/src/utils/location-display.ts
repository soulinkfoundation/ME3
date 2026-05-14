export interface PublicLocationData {
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locality?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  precision?: string | null;
}

export interface PublicLocationProfile {
  location?: string | null;
  locationData?: PublicLocationData | null;
}

type RegionDisplayNames = {
  of(code: string): string | undefined;
};

type RegionDisplayNamesConstructor = new (
  locales: string | string[],
  options: { type: "region" },
) => RegionDisplayNames;

function normalizeText(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() || null : null;
}

function comparableName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function samePlaceName(left: string | null, right: string | null): boolean {
  return Boolean(left && right && comparableName(left) === comparableName(right));
}

function getCountryNameFromCode(value: unknown): string | null {
  const code = normalizeText(value)?.toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;

  try {
    const DisplayNames = (
      Intl as typeof Intl & { DisplayNames?: RegionDisplayNamesConstructor }
    ).DisplayNames;
    return normalizeText(DisplayNames ? new DisplayNames("en", { type: "region" }).of(code) : null);
  } catch {
    return null;
  }
}

function normalizeCountryName(value: unknown): string | null {
  const country = normalizeText(value);
  if (!country) return null;
  const aliases = country.split("/").map((part) => normalizeText(part)).filter(Boolean) as string[];
  return aliases.length > 0 ? aliases[aliases.length - 1] : country;
}

function dedupeParts(parts: Array<string | null>): string[] {
  const seen = new Set<string>();
  const displayParts: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const key = comparableName(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    displayParts.push(part);
  }

  return displayParts;
}

function splitLocationLabel(value: string | null): string[] {
  return dedupeParts((value || "").split(",").map((part) => normalizeText(part)));
}

function getLocationData(profile: PublicLocationProfile): PublicLocationData | null {
  return profile.locationData && typeof profile.locationData === "object"
    ? profile.locationData
    : null;
}

function inferPrimaryPlace(
  data: PublicLocationData,
  fallbackLocation: string | null,
  country: string | null,
): string | null {
  const locality = normalizeText(data.locality);
  if (locality) return locality;

  if (normalizeText(data.precision) === "country") return null;

  const label = normalizeText(data.label) || fallbackLocation;
  for (const part of splitLocationLabel(label)) {
    if (!samePlaceName(part, country)) return part;
  }

  const region = normalizeText(data.region);
  return region && !samePlaceName(region, country) ? region : null;
}

export function formatPublicLocation(profile: PublicLocationProfile): string {
  const fallbackLocation = normalizeText(profile.location);
  const locationData = getLocationData(profile);
  if (!locationData) return fallbackLocation || "";

  const country =
    getCountryNameFromCode(locationData.countryCode) ||
    normalizeCountryName(locationData.country);
  const primaryPlace = inferPrimaryPlace(locationData, fallbackLocation, country);
  const displayParts = dedupeParts([primaryPlace, country]);

  return displayParts.join(", ") || normalizeText(locationData.label) || fallbackLocation || "";
}
