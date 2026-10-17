# Frontend conventions

Rules for `frontend/`, taken from Protect's `services/frontend/FRONTEND_CONVENTIONS.md` so a screen here behaves as a screen there: on a laptop in the field most of all, and on a phone. Read `CONVENTIONS.md` at the repository root first. Protect's file is the master; a rule changed there is changed here.

## Stack

React 19, Vite, TypeScript strict, Tailwind 4, shadcn/ui (Radix), TanStack Query, Zustand, React Hook Form with Zod when forms come, React Router 8, MapLibre GL JS when the map comes (phase 2), Vitest. `npm run build` runs the type check first; a type error fails the build.

## Colour system

Colours are CSS variables in `src/index.css`, copied from Protect and exposed to Tailwind through `@theme`. Components use semantic tokens (`bg-primary`, `text-muted-foreground`), never hex values. The tokens exist twice, on `:root` and under `.dark`; a component never needs a `dark:` class for a colour.

| Token | Value | Use |
| --- | --- | --- |
| `--brand-green-dark` | `#52735E` | Primary actions, active navigation, headings on light surfaces |
| `--brand-green-light` | `#90AE9B` | Secondary actions, focus rings, selected states |
| `--brand-sand` | `#C6B187` | Warm accents, warning tint |
| `--brand-blue` | `#BED2D4` | Informational tint |
| `--brand-coral` | `#EDA08F` | Attention tint (not for errors) |
| `--destructive` | `#A13D2D` | Errors and destructive actions |

## Map

When the map comes: one `useMap` hook per full map, MapLibre imported through one module that bundles the worker, symbol layers in the font the tiles ship, marker images from one module. The offline tiles are a PMTiles extract from the field bundle (decision D4).

## Z-index ladder

Do not invent z-index values. Map 0 (every map container gets an explicit `z-0`), in-page sticky 10 to 30, app overlays 50 (dialogs, sheets, dropdowns, popovers), toasts 100.

## Responsive rules

- Target viewports: phone 390 px, tablet 768 px, desktop 1440 px.
- The page body never scrolls horizontally. Wide content scrolls inside its own `overflow-x-auto` container; a card or grid item that holds such content needs `min-w-0` (the shared `Card` has it).
- Branch on width with a media query hook or Tailwind's `sm:` classes, never with `window.innerWidth` in render.
- Inputs stay 16 px on touch devices (global rule in `index.css`).
- Safe-area insets are handled once on `body`.

## State

- Filters and selection live in the URL (`useSearchParams`).
- Server data lives in TanStack Query. Query keys come from `src/api/queryKeys.ts`, never inline arrays.
- Client state that must outlive a component lives in a Zustand store, not React Context.

## API access

One typed `fetch` wrapper in `src/api/client.ts`. Pages and hooks call it inside a TanStack Query `queryFn`; there are no per-domain API modules.

## Components

- shadcn/ui components live in `src/components/ui/`, copied from Protect's; generated files are excluded from ESLint and not edited by hand except to fix a bug, noted in a comment.
- Every component that has a non-obvious shape gets a header comment saying why.
- Functional components, named exports, `type` imports separated.

## Testing

Vitest with Testing Library. A test per component that has logic.

## Text people read

Every string a person reads goes through the translation layer: `const { t } = useTranslation()` in a component or hook, `i18n.t()` at module level, with the English text as the key. Interpolate with `t("{{count}} files", { count })`, never by concatenation. The lint rule `i18next/no-literal-string` refuses JSX text and the attributes people see; after adding strings run `npm run i18n:extract` so the English catalogue stays complete (CI checks it), and write the Dutch line in `src/locales/nl/translation.json` by hand, appended, so the diff stays small.
