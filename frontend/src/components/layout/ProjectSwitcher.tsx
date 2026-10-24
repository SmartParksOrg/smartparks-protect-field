import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { api, send, type Bundle, type LaptopProject, type LoadResult } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ServerProject {
  id: string;
  name: string;
  stations: number;
}

/** The project the app is about, in the top bar as Protect's switcher is (decision D33; Tim,
 * 2026-10-24: the app did not say which project it was using). The button carries the loaded
 * project's name; the list holds the projects on the laptop, which switch at once without a
 * connection (D31), and, online and signed in, the server's projects with an offload station,
 * which are loaded with their map when chosen. After either, every page reads the new project. */
export function ProjectSwitcher({ signedIn, online, className }: { signedIn: boolean; online: boolean | undefined; className?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const laptop = useQuery({ queryKey: queryKeys.laptopProjects, queryFn: () => api<LaptopProject[]>("/api/bundle/projects") });
  const server = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api<ServerProject[]>("/api/projects"),
    enabled: open && signedIn && online !== false,
    retry: false,
  });
  const onLaptop = laptop.data ?? [];
  const onLaptopIds = new Set(onLaptop.map((p) => p.project_id));
  // only a project with an offload station has a card to read (Tim, 2026-10-17)
  const onServer = (server.data ?? []).filter((p) => p.stations > 0 && !onLaptopIds.has(p.id));
  const settle = (loaded: LoadResult) => {
    setOpen(false);
    queryClient.setQueryData(queryKeys.bundle, loaded.bundle);
    queryClient.setQueryData(queryKeys.map, loaded.map);
    void queryClient.invalidateQueries();
    void navigate("/");
  };
  const switchTo = useMutation({
    mutationFn: (project: LaptopProject) => send<LoadResult>("POST", "/api/bundle/switch", { project_id: project.project_id }),
    onSuccess: settle,
  });
  const load = useMutation({
    mutationFn: (project: ServerProject) => send<LoadResult>("POST", "/api/bundle/fetch", { project_id: project.id, project_name: project.name }),
    onSuccess: settle,
  });
  const busy = switchTo.isPending || load.isPending;
  const busyName = switchTo.variables?.project_name ?? load.variables?.name ?? null;
  const current = bundle.data?.present ? bundle.data.project_name : null;
  const label = busy && busyName ? t("Loading {{project}}", { project: busyName }) : (current ?? t("Select a project"));
  const error = switchTo.error ?? load.error;
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label={t("Project")} className={cn("justify-between", className)} disabled={busy}>
          {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : null}
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-1.5rem))] p-0 sm:w-80 lg:w-96" align="start">
        <Command>
          <CommandInput placeholder={t("Search projects")} />
          <CommandList>
            <CommandEmpty>{t("No project found.")}</CommandEmpty>
            {onLaptop.length > 0 && (
              <CommandGroup heading={t("On this laptop")}>
                {onLaptop.map((project) => {
                  const hint = project.current ? t("loaded") : project.stale ? t("older than a week") : t("on this laptop");
                  return (
                    <CommandItem key={project.project_id} value={`${project.project_name} ${project.project_id}`} disabled={busy} onSelect={() => (project.current ? setOpen(false) : switchTo.mutate(project))}>
                      <Check className={cn("mr-2 size-4", project.current ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{project.project_name}</span>
                      <span className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground">{hint}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {onServer.length > 0 && (
              <CommandGroup heading={t("On the server, not on this laptop yet")}>
                {onServer.map((project) => (
                  <CommandItem key={project.id} value={`${project.name} ${project.id}`} disabled={busy} onSelect={() => load.mutate(project)}>
                    <Check className="mr-2 size-4 opacity-0" />
                    <span className="truncate">{project.name}</span>
                    <span className="ml-auto shrink-0 pl-2 text-xs whitespace-nowrap text-muted-foreground">{t("{{count}} stations", { count: project.stations })}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {!signedIn
              ? t("Sign in on the Server page to load another project from the server.")
              : online === false
                ? t("Offline: only the projects on this laptop can be used.")
                : server.isFetching
                  ? t("Asking the server for its projects")
                  : server.isError
                    ? t("The server's projects could not be read: {{reason}}", { reason: server.error.message })
                    : t("Every project with an offload station is kept on this laptop with its map and brought up to date while online; a switch changes the view alone.")}
          </div>
          {error && (
            <div className="px-2 pb-2">
              <Callout kind="error">{error.message}</Callout>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
