/**
 * Re-export system tool catalog from @coppergate/db (single source of truth).
 */
import {
  SYSTEM_TOOL_CATALOG,
  systemToolMeta,
  type SystemToolCatalogEntry,
} from "@coppergate/db";

export type ToolCatalogEntry = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias";
  description: string;
};

export const TOOL_CATALOG: ToolCatalogEntry[] = SYSTEM_TOOL_CATALOG.map(
  (t: SystemToolCatalogEntry) => ({
    key: t.key,
    title: t.title,
    kind: t.kind,
    description: t.description,
  }),
);

export function toolMeta(key: string): ToolCatalogEntry {
  const m = systemToolMeta(key);
  return {
    key: m.key,
    title: m.title,
    kind: m.kind,
    description: m.description,
  };
}
