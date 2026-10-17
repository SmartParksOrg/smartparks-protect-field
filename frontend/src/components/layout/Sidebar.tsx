import { useTranslation } from "react-i18next";
import { Languages, LogOut, PanelLeftClose } from "lucide-react";
import { NavLink } from "react-router";

import { sections, type NavItem } from "@/components/layout/navigation";
import { Button } from "@/components/ui/button";
import i18n, { LANGUAGES } from "@/i18n";
import { cn } from "@/lib/utils";

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent",
          isActive ? "bg-primary text-primary-foreground hover:bg-primary" : "text-foreground",
        )
      }
    >
      <Icon className="size-4" />
      {t(item.label)}
    </NavLink>
  );
}

/** The navigation column, after Protect's (decision D13): the pages of the project and the
 * settings, and at the foot the account and the language. The pages that need a project on the
 * laptop appear once one is loaded. */
export function Sidebar({
  email,
  hasBundle,
  onNavigate,
  onSignOut,
  collapsible = false,
  onCollapse,
}: {
  email: string | null;
  hasBundle: boolean;
  onNavigate?: () => void;
  onSignOut?: () => void;
  collapsible?: boolean;
  onCollapse?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-end px-2">
        {collapsible && (
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={t("Hide navigation")} title={t("Hide navigation")} onClick={onCollapse}>
            <PanelLeftClose className="size-5" />
          </Button>
        )}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {sections.map((section) => {
          const items = section.items.filter((item) => !item.needsBundle || hasBundle);
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <div className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t(section.label)}</div>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <Item key={item.label} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t px-3 py-3">
        <div className="truncate px-3 text-xs text-muted-foreground" title={email ?? undefined}>
          {email ?? t("Not signed in")}
        </div>
        {email && onSignOut && (
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={onSignOut}>
            <LogOut className="size-4" /> {t("Sign out")}
          </Button>
        )}
        <label className="mt-1 flex items-center gap-2 px-3 text-xs text-muted-foreground">
          <Languages className="size-4" />
          <select
            aria-label={t("Language")}
            className="flex-1 rounded-md border bg-background px-1 py-0.5 text-xs"
            value={i18n.resolvedLanguage ?? "en"}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
