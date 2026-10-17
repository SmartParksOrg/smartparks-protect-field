/** The sidebar's sections, after Protect's (decision D13): the project's pages first, then the
 * settings. The labels are marked for extraction and translated where they are shown. */
import type { LucideIcon } from "lucide-react";
import { CloudUpload, FolderOpen, Home, Map as MapIcon, PackageOpen, Server } from "lucide-react";

import { t } from "@/lib/i18nMark";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Shown only once a project is on the laptop. */
  needsBundle?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const sections: NavSection[] = [
  {
    label: t("Project"),
    items: [
      { label: t("Overview"), icon: Home, to: "/" },
      { label: t("Map"), icon: MapIcon, to: "/map", needsBundle: true },
      { label: t("Files"), icon: FolderOpen, to: "/files", needsBundle: true },
      { label: t("Upload"), icon: CloudUpload, to: "/upload", needsBundle: true },
    ],
  },
  {
    label: t("Settings"),
    items: [
      { label: t("Server"), icon: Server, to: "/setup" },
      // a project is the server's, so its loading sits with the server (Tim, 2026-10-17)
      { label: t("Load a project"), icon: PackageOpen, to: "/load" },
    ],
  },
];
