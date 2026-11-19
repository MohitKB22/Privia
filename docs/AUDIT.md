# PRIVIA repository audit

Audit date: 2026-11-19. Baseline: local `main` at `5a505da` (227 tracked files).
Every finding below was checked against code or by running it; nothing is taken
from documentation alone.

## 1. Architecture (as implemented)

| Layer | Location | State |
|---|---|---|
| FastAPI backend, 12 routers, DI container | `apps/api` | Working. Starts, migrates, serves 50+ endpoints. |
| React 18 + TypeScript + Tailwind client | `apps/desktop/src` | Working in a browser via the Vite dev proxy. |
| Tauri v1 shell (window + folder picker) | `apps/desktop/src-tauri` | **Does not build** (see C3). |
| Shared Pydantic models, config | `packages/shared-types` | Working. |
| Permission engine, path/command/URL guards, secrets, audit | `packages/security` | Working, well tested. |
| SQLite engine + SQL migrations (3) + repositories | `packages/storage` | Working. |
| Deterministic tool runtime, 38 tools, middleware chain | `packages/tool-runtime` | Working. |
| Agent orchestrator (classify -> plan -> execute -> respond) | `packages/agent-core` | Working; offline rule planner when no model. |
| Memory with local hashed embeddings or Ollama embeddings | `packages/memory`, `services/embeddings` | Working. |
| Ollama, OpenAI, Anthropic, heuristic providers + router | `services/llm` | Working; cloud is opt-in and permission-gated. |
| faster-whisper STT, pyttsx3 TTS (optional extras) | `services/speech` | Working when extras are installed. |
| Files, notes, email (local/SMTP/IMAP), ICS calendar, HTTP browser, terminal | `services/integrations` | Working. |

Baseline checks (all executed): ruff, black, mypy, bandit clean; **470/470** Python
tests pass on 3.10; ESLint, `tsc`, Prettier clean; **13/13** Vitest tests pass;
`vite build` succeeds.

## 2. Prioritised findings

### Critical - blocks a public release or is a security hole

| # | Finding | Evidence | Fix |
|---|---|---|---|
| C1 | **The GitHub repository is not buildable.** It was uploaded through the web UI, which flattened `apps/` and `packages/` to the top level and dropped every dotfile (`.github/workflows`, `.gitignore`, `.env.example`, `.eslintrc.cjs`, `.prettierrc.json`). It also contains `__pycache__`, `privia.egg-info` and `desktop/dist`. `pip install -e .` fails because `pyproject.toml` points at `packages/...` paths that do not exist there, and CI never runs. | Cloned `MohitKB22/Privia` (HEAD `05d6e76`) and diffed against local: contents identical, layout different. | Push the local tree (needs the owner's approval). |
| C2 | **A packaged app cannot reach its backend, and no backend is shipped.** `api.ts` uses `BASE = ''` unless `VITE_PRIVIA_API` is set, so in a Tauri build every call goes to `tauri://localhost/api/...`. Nothing starts the Python backend; users would have to install Python and run `make dev`. | `apps/desktop/src/lib/api.ts:24`; `main.rs` has no process management. | Bundle the backend as a PyInstaller sidecar that the Rust shell starts, health-checks and stops; resolve the API base at runtime from the shell. |
| C3 | **`tauri build` fails.** Cargo features `shell-open` and `window-start-dragging` do not match the allowlist (Tauri v1 refuses to build); no icons exist; no `Cargo.lock`. The release workflow uses `ubuntu-latest` (24.04 has no `libwebkit2gtk-4.0-dev`, which Tauri v1 needs), passes `universal-apple-darwin` as a rustup target (invalid), and publishes no checksums. CORS omits `https://tauri.localhost`, the Windows origin. | `src-tauri/Cargo.toml`, `tauri.conf.json`, `.github/workflows/release.yml`, `config.py:51`. | Align features, generate icons from a script, commit the lockfile, fix the workflow, add SHA-256 sums. |
| C4 | **DNS-rebinding exposure of the local API.** No `Host` validation and no auth on loopback. A web page whose domain is rebound to 127.0.0.1 is same-origin with the API. | Probe: `GET /api/v1/privacy/export` with `Host: evil.example` returned **200** with the full export; `POST /api/v1/memory` returned **200**. | Host allow-list, Origin check, and a per-launch API token supplied by the desktop shell. |
| C5 | **Backend crashes on Python 3.13+.** `privia_speech/audio.py` imports `audioop`, removed in 3.13 (PEP 594), yet `requires-python = ">=3.10"`. | `ModuleNotFoundError: No module named 'audioop'` at import on 3.13. | Depend on `audioop-lts` for 3.13+ (drop-in). **Fixed**; 470/470 pass on 3.13. |

### High - visible bugs or missing required behaviour

| # | Finding | Location |
|---|---|---|
| H1 | `/chat/stream` ignores a rejection (`confirm: false`): it re-runs the agent instead of recording "not done" like `/chat` does. | `routers/chat.py` `chat_stream` |
| H2 | The model can only be chosen through environment variables; `OllamaProvider.list_models()` exists but nothing exposes it. | `services/llm`, `routers/health.py` |
| H3 | Memories cannot be edited (repository has `update`, API and UI do not). | `routers/memory.py` |
| H4 | The Rust `pick_folder` command is never called by the UI. | `src-tauri/src/main.rs` vs `src/` |
| H5 | `StatusBar` writes to the store during render; the "Recording" indicator never turns on (`micActive` is a constant `false`). | `StatusBar.tsx`, `App.tsx` |
| H6 | Search boxes (files, notes, memory) send one request per keystroke and can trip the 120/min rate limiter. | `useAsync` call sites |
| H7 | The activity feed uses `EventSource`, which cannot send an auth header, so it breaks as soon as a token is enforced. | `api.ts` `subscribeToActivity` |

### Medium

| # | Finding |
|---|---|
| M1 | Tracked junk: 12 `vite.config.ts.timestamp-*.mjs` files and a 446 KB `.coverage.claude.*` binary. |
| M2 | `pyproject.toml` uses the deprecated `license = { text = ... }` table (setuptools stops accepting it on 2027-02-18) and links to `github.com/privia-app/privia`, which does not exist. |
| M3 | Metadata says "Production/Stable 1.0.0" although no installer has ever been produced. |
| M4 | UI does not match the PRIVIA brief: teal accent, no header/global search, sidebar not collapsible, no Integrations or Planner page, no Markdown or code blocks, no streaming, stop, copy or regenerate, no conversation history, no first-run setup. |
| M5 | The FastAPI range (`>=0.115`) includes versions that parse a JSON body sent with no `Content-Type`, which a cross-site `no-cors` request can send. Closed by the Origin check in C4. |

### Configuration-only or documentation-only

* `VECTOR_STORE=chroma` and the `vector` extra: no Chroma code exists; only SQLite vectors are implemented.
* `GOOGLE_CLIENT_*` and `AZURE_OPENAI_*` settings: no provider uses them.
* The README already states there is no Google Calendar or CalDAV sync; that is accurate.

## 3. What is solid and must be preserved

* Approvals are bound to the exact session, tool and arguments: the confirmation id is a SHA-256 of all three (`Tool.confirmation_id`), stored records are single-use and expire.
* The LLM never executes anything; the runtime validates schema, scope, path, command and URL before running a tool.
* Path guard resolves symlinks and blocks sensitive files; command guard is an allow-list with no shell; URL guard blocks private ranges (SSRF).
* Memory refuses to store detected secrets; secrets are kept in the OS keychain or an encrypted file.
* Errors use one envelope and never leak stack traces.
