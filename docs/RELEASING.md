# Releasing and maintaining PRIVIA

Everything here runs on free infrastructure: GitHub Actions standard runners are
free for public repositories, and GitHub Pages hosts the website for free. No
paid service is involved unless you add code-signing certificates.

## Versions

The version lives in five files. Keep them identical with:

```bash
python scripts/version.py show
python scripts/version.py set 1.0.1     # rewrites all five, plus package-lock.json
python scripts/version.py check --tag v1.0.1
```

Use semantic versioning. A tag with a suffix (`v1.1.0-beta.1`) becomes a
pre-release.

## Cutting a release

```bash
python scripts/version.py set 1.0.1
# write docs/releases/v1.0.1.md (copy docs/releases/TEMPLATE.md)
git commit -am "Release 1.0.1"
git tag v1.0.1
git push origin main v1.0.1
```

The **Release** workflow then:

1. checks the tag matches every version file,
2. on macOS (Apple Silicon and Intel), Windows and Linux: freezes the backend
   with PyInstaller, smoke-tests the frozen binary (start-up, token, migrations,
   Host check, clean exit), builds the Tauri installers, and names them
   `PRIVIA-<version>-<platform>.<ext>`,
3. creates a **draft** GitHub Release with all installers and `SHA256SUMS.txt`.

Download the drafts, install at least one, then press **Publish release**. The
website's download buttons point at the newest *published* release only.

To rebuild an existing tag, run the workflow manually (Actions → Release → Run
workflow) and enter the tag. If a release for that tag already exists, the
workflow replaces its installers and leaves its text and state alone.

**Without a terminal:** on GitHub, open **Releases → Draft a new release**, type
the new tag (for example `v1.0.1`), target `main`, tick **Set as a pre-release**
and publish. Creating the tag starts the Release workflow, which attaches the
installers to that release. When they are there, untick pre-release.

## Code signing (optional, paid)

Unsigned builds work, but macOS and Windows warn on first launch.

**macOS** (Apple Developer Program, about USD 99 a year). Add these repository
secrets and the workflow signs and notarizes automatically:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | base64 of your "Developer ID Application" `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple ID, app-specific password, team id, for notarization |

Without them, macOS builds are ad-hoc signed (required for Apple Silicon to run
them at all) and users approve the first launch in System Settings.

**Windows**: an OV or EV code-signing certificate from a commercial authority.
Tauri's `bundle.windows.certificateThumbprint` or a `signCommand` can use it;
this is not wired up yet. Until then SmartScreen shows a warning.

Never commit certificates, passwords or API keys. The CI secret scan (gitleaks)
and a tracked-file check fail the build if one appears.

## Website

`site/` is a static page deployed by the **Website** workflow on every push to
`main` that touches it. One-time setup: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. The site is then at
`https://<owner>.github.io/<repo>/`.

Update the screenshots in `site/assets/` when the interface changes; they are
WebP files of about 30–50 KB.

## Continuous integration

**CI** runs on every push and pull request: ruff, black, mypy and the Python
suite on 3.10 to 3.13 (Linux) and 3.12 (macOS, plus Windows as non-blocking),
ESLint, tsc, Prettier, Vitest and a production build of the UI, rustfmt and
clippy for the Tauri shell, bandit, pip-audit, npm audit and gitleaks, and a
clean-install test with no network.

Locally, `make check` runs the Python and UI parts.

## Runner and platform notes

- macOS Intel builds use `macos-15-intel`, GitHub's last Intel runner. GitHub
  plans to retire it in 2027; after that, ship Apple Silicon only or build a
  universal binary.
- Linux builds run on Ubuntu 22.04 so the result runs on older distributions
  (glibc 2.35+). Tauri 2 needs `libwebkit2gtk-4.1`.
- If a runner label stops working, check GitHub's runner images list and update
  `.github/workflows/release.yml`.

## Dependency updates

- Python: bump ranges in `pyproject.toml`, run `make check`.
- UI: `npm outdated`, update, run `npm test && npm run build`.
- Rust: `cargo update` in `apps/desktop/src-tauri`, then `cargo clippy`.
- Keep the Tauri CLI (`@tauri-apps/cli`), the JS API and the Rust crates on the
  same major version.
