#!/usr/bin/env bash
# Daily development commands for Smart Parks Protect Go. Run from anywhere in the repository.
#   scripts/dev.sh run | desktop | freeze | test | lint | format | docs | hooks | bump-protect [rev]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

usage() {
    sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
}

cmd="${1:-}"
shift || true

case "$cmd" in
    run)
        # the local server with the built interface; `cd frontend && npm run dev` for live reload
        uv run protect-go "$@"
        ;;
    desktop)
        # the Electron shell against the repository's virtual environment and the built interface
        (cd frontend && npm run build)
        (cd electron && env -u ELECTRON_RUN_AS_NODE npm run dev)
        ;;
    freeze)
        # the frozen backend as the installers carry it, in dist/backend/
        (cd frontend && npm run build)
        uv run pyinstaller backend.spec --clean --noconfirm "$@"
        ;;
    test)
        uv run pytest -q "$@"
        (cd frontend && npm run test)
        ;;
    lint)
        uv run ruff check .
        uv run ruff format --check .
        uv run mypy
        (cd frontend && npm run lint && npm run typecheck)
        (cd electron && npm run lint)
        ;;
    format)
        uv run ruff format .
        uv run ruff check --fix .
        ;;
    docs)
        uv run --only-group docs mkdocs build --strict "$@"
        uv run scripts/docs_check.py
        ;;
    hooks)
        git config core.hooksPath .githooks
        echo "Git hooks installed from .githooks"
        ;;
    bump-protect)
        # Moves the pin on Protect's shared package to a commit (the newest of main without an
        # argument), relocks, and runs the tests that prove the decoding still works here.
        rev="${1:-$(git ls-remote https://github.com/SmartParksOrg/smartparks-protect refs/heads/main | cut -f1)}"
        sed -i -E "s/(smartparks-protect-shared = \{ git = [^,]+, subdirectory = \"shared\", rev = \")[0-9a-f]+(\" \})/\1${rev}\2/" pyproject.toml
        uv lock --upgrade-package smartparks-protect-shared
        uv sync --all-groups
        uv run pytest -q tests/test_protect_decoding.py
        echo "Protect pinned at ${rev}; record it in CHANGELOG.md and DEVELOPERS.md"
        ;;
    *)
        usage
        ;;
esac
