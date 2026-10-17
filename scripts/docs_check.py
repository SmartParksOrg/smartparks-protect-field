#!/usr/bin/env python3
"""Documentation checks beyond `mkdocs build --strict`, Protect's script without its MCP half:
internal links and anchors in the built site, and Mermaid fences that name a known diagram type.

    uv run scripts/docs_check.py            # after `mkdocs build --strict`
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
DOCS = ROOT / "docs"
MERMAID_TYPES = (
    "graph",
    "flowchart",
    "sequenceDiagram",
    "classDiagram",
    "stateDiagram",
    "stateDiagram-v2",
    "erDiagram",
    "gantt",
    "pie",
    "journey",
    "gitGraph",
    "mindmap",
    "timeline",
    "quadrantChart",
    "xychart-beta",
)


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "a" and attributes.get("href"):
            self.links.append(str(attributes["href"]))
        if attributes.get("id"):
            self.ids.add(str(attributes["id"]))
        if tag == "a" and attributes.get("name"):
            self.ids.add(str(attributes["name"]))


def site_prefix() -> str:
    """The path of `site_url` in mkdocs.yml ("/smartparks-protect-field/" on GitHub Pages): the
    built site writes root-relative links under it, which the check maps back to `site/`."""
    for line in (ROOT / "mkdocs.yml").read_text(encoding="utf-8").splitlines():
        if line.startswith("site_url:"):
            return urlsplit(line.split(":", 1)[1].strip()).path.rstrip("/") + "/"
    return "/"


def check_links() -> list[str]:
    if not SITE.is_dir():
        return ["site/ is missing: run `uv run mkdocs build --strict` first"]
    prefix = site_prefix()
    pages: dict[Path, Page] = {}
    for html in SITE.rglob("*.html"):
        page = Page()
        page.feed(html.read_text(encoding="utf-8"))
        pages[html] = page
    problems: list[str] = []
    for html, page in pages.items():
        for href in page.links:
            parts = urlsplit(href)
            if parts.scheme or href.startswith(("mailto:", "tel:", "javascript:")):
                continue
            if not parts.path:
                target_path = html
            elif parts.path.startswith("/"):
                path = unquote(parts.path)
                if path.startswith(prefix):
                    path = path[len(prefix) :]
                target_path = (SITE / path.lstrip("/")).resolve()
            else:
                target_path = (html.parent / unquote(parts.path)).resolve()
            if parts.path:
                if target_path.is_dir():
                    target_path = target_path / "index.html"
                if not target_path.exists():
                    problems.append(f"{html.relative_to(SITE)}: broken link {href}")
                    continue
            if parts.fragment:
                target = pages.get(target_path)
                if target is None:
                    if target_path.suffix == ".html":
                        problems.append(f"{html.relative_to(SITE)}: {href} points outside the site")
                    continue
                if unquote(parts.fragment) not in target.ids:
                    problems.append(f"{html.relative_to(SITE)}: missing anchor {href}")
    return problems


def check_mermaid() -> list[str]:
    problems: list[str] = []
    fence = re.compile(r"```mermaid\s*\n(.*?)```", re.S)
    for md in DOCS.rglob("*.md"):
        for block in fence.findall(md.read_text(encoding="utf-8")):
            first = next((line.strip() for line in block.splitlines() if line.strip()), "")
            head = first.split()[0] if first else ""
            if head.rstrip(":") not in MERMAID_TYPES and not first.startswith("%%"):
                problems.append(f"{md.relative_to(ROOT)}: mermaid fence starts with {first!r}")
    return problems


def main() -> int:
    problems = check_links() + check_mermaid()
    for problem in problems:
        print(problem)
    print(f"docs check: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
