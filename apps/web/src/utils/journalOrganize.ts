export type JournalOrganizeProject = {
  id: string;
  name: string;
  slug?: string | null;
};

export type JournalTaskMarkerSuggestion = {
  id: string;
  title: string;
  sourceText: string;
  projectId: string;
  projectName: string;
};

function markerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanTaskTitle(line: string): string {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/\s*#task\b/gi, "")
    .replace(/\s+@[a-z0-9][\w-]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJournalTaskMarkers(
  text: string,
  projects: JournalOrganizeProject[],
): JournalTaskMarkerSuggestion[] {
  const projectByMarker = new Map<string, JournalOrganizeProject>();
  for (const project of projects) {
    projectByMarker.set(markerKey(project.name), project);
    if (project.slug) projectByMarker.set(markerKey(project.slug), project);
  }
  const fallbackProject = projects[0];
  if (!fallbackProject) return [];

  return text
    .split(/\r?\n/)
    .map((line, index) => {
      if (!/#task\b/i.test(line)) return null;
      const mention = line.match(/@([a-z0-9][\w-]*)/i)?.[1] || "";
      const project = mention
        ? projectByMarker.get(markerKey(mention))
        : fallbackProject;
      const title = cleanTaskTitle(line);
      if (!project || !title) return null;
      return {
        id: `task-${index}`,
        title,
        sourceText: line.trim(),
        projectId: project.id,
        projectName: project.name,
      };
    })
    .filter((item): item is JournalTaskMarkerSuggestion => Boolean(item));
}
