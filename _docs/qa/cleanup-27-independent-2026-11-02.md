# Independent QA: cleanup #27

PASS — scoped cleanup acceptance only. The full baseline and storage correctness
are **not** accepted by this verdict; their outstanding failures are below.

Issue: https://github.com/Kulynym/INF316/issues/27

Tested pushed commit: `b08f07870416ff2dbd0cdefe3fdaf22ae92fe356`.
GitHub's commit API and `git/ref/heads/main` independently confirmed this SHA.
Execution: 2026-11-02, Node `v24.16.0`, npm `11.13.0`, macOS/Darwin arm64,
Next.js `16.4.2`, Vitest `5.0.5`.

## Isolation and commands

Sources were exported directly from `git archive b08f078` into the owned,
ignored `.local/qa-cleanup27-23gz5all/` directory. The copied lockfile was kept
alongside that directory as `qa-cleanup27-23gz5all-lock.json`, rather than inside
it, so Next's existing module-resolution convention finds the repository's
installed dependencies. Source/config/test files were from the tested commit;
neither dirty QA test was overlaid. No dependency installation or modification
was performed. This is not fresh-`npm ci` acceptance.

Build/test child environments used an allowlist of ordinary OS variables, with
no inherited provider credentials or `TEST_URL`. No original `.env`, database,
uploads, secret or build cache was copied. The default build and port-probing
tests ran with the required local-port permission. No cache was deleted.

| Check in the isolated source copy | Actual result |
| --- | --- |
| `npm run build` (unchanged default: `next build`) | Exit 0, **Turbopack**, compiled successfully; TypeScript and all 5 static pages completed |
| `npm run typecheck` | Exit 0 |
| `vitest run tests/contract.test.ts tests/test-runner.test.ts` | 26 passed, 0 failed, 0 skipped; exit 0 |
| `TEST_ADAPTER=sqlite vitest run tests/store.test.ts tests/jobs.test.ts tests/storage-cache.test.ts tests/legacy-grants.test.ts` | 16 passed, 0 failed, 0 skipped; exit 0; temporary file-backed SQLite |
| `npm test` on the exact pushed source | 90 passed, **1 failed**, 21 skipped; exit 1; pre-existing date fixture failure below |

The default build was independently executed successfully, not inferred from
the engineer's webpack fallback. Its emitted routes were `/`, `/_not-found`,
`/api/actions`, `/api/export`, `/api/files/[id]`, `/api/jobs`, `/api/state`.

An owned `next start --hostname 127.0.0.1 --port 52726` preview of that build
returned HTTP 200 for `/` and `/maxball-logo.png`. The logo response was
`image/png` and its SHA-256 matched the canonical asset. This smoke check used
the memory adapter, an ephemeral synthetic app secret and **zero application API
calls**. The owned process group was terminated and awaited in `finally`.
Port 3000 was never accessed. No browser or live-provider acceptance is claimed.

## Per-AC verdict

- **AC1 PASS.** The manifest, root lockfile dependencies, lockfile installed-package
  entries and Next external-package configuration no longer contain PGlite.
  Parsed manifest/lock direct and development dependency maps agree exactly.
  The commit's only dependency change is removal of PGlite. `npm ls
  @electric-sql/pglite --all` returned an empty tree (expected exit 1 for absence).
  `npm ls --depth=0 --omit=dev` exited 0 with `pg@8.23.1`,
  `typeorm@0.3.27`, `better-sqlite3@12.4.1` and the other retained direct packages.
  `scripts/setup.mts` still imports `Pool` from `pg` and uses `DATABASE_URL`;
  its source and `src/server/pg-config.ts` are unchanged.
- **AC2 PASS.** The only tracked deletion is `_docs/assets/maxball-logo.png`.
  Before cleanup both logos had SHA-256
  `199686a1b20994ea43b10e352a4e1582570f95b31a8cc8027c990dddd997f127`.
  The remaining `public/maxball-logo.png` retains that hash and was served with
  identical bytes by the built app. All three logo links in `_docs` resolve to
  this one file: architecture, decisions and design-system. No obsolete docs
  asset reference remains; all historical documents remain tracked.
- **AC3 PASS.** The sole application-source change removes the unused
  `temporaryPreview` export from `src/lib/client.ts`. Searches before removal
  found only its definition; after removal no source caller or definition
  remains. Other functions in that file are unchanged. Runner changes are
  comments only and accurately identify SQLite/memory, installed Playwright
  and strict-mode failure handling. `.env.example` names local SQLite and
  legacy pg setup; it and README explicitly identify #26 as pending rather than
  claiming production readiness. Historical PGlite evidence remains intact.
- **AC4 PASS.** Commit diff inspection found no backend/domain, mockService,
  OpenAPI, migration, regression-test, historical QA or uploaded-data change.
  Original `.local/maxball.sqlite`, `.local/uploads`, `.local/secret` and
  `.local/postgres` are present. QA never opened their contents or removed them;
  no pre-cleanup content hash of ignored data is claimed. The two dirty QA
  files retain the pre-cleanup hashes below and remain uncommitted. There was
  no deployment, provider call, backend fix or port-3000 interaction.
- **AC5 PASS for cleanup scope.** The actual default Turbopack build, typecheck,
  26 contract/runner checks, 16 SQLite compatibility checks and live asset
  smoke check passed independently. Dependency absence and logo links were
  directly asserted. Full-suite failures/skips and unresolved storage defects
  are retained and explicitly reported below; they are not a site-wide PASS.

## Preserved failures and limits

The exact pushed `npm test` baseline fails at `tests/domain.test.ts:250`:
`computes statistics on Asia/Almaty day boundaries and excludes reopened issues`,
expected total `1`, received `7`. This same date-fixture collision was observed
before cleanup at `2aa4c2c`. The working tree contains an earlier uncommitted QA
fixture stabilization; it was deliberately **not** incorporated into this
commit's evidence or changed during cleanup QA. The 21 environment-gated HTTP
tests were skipped without `TEST_URL`; no HTTP-suite acceptance is claimed.

Storage correctness remains unresolved. Before this cleanup, the independent
`tests/qa-storage-correctness.test.ts` execution at `2aa4c2c` had **9 failed,
4 passed**: both adapters exposed uncommitted rows and lost successful unrelated
writes/transactions on another rollback; memory also retained a rejected sibling's
write; SQLite reused receipt number `1001` after deletion, including after
reopen. Storage code is unchanged by #27. Those tests were preserved rather than
rerun, deleted, disabled or staged here. No new bug issue was opened from that
paused scope. #26 production setup, #1 live providers and #2 publication remain
separate; this cleanup does not accept them.

Preserved working-tree SHA-256 values, checked both before and after cleanup:

- `tests/domain.test.ts`:
  `7c327ea96b791cf3946ac9712e7a0af6dfc8c8640ae708c83a5c511e26a4139b`
- `tests/qa-storage-correctness.test.ts`:
  `3985379da3e45825c2afec15b6152adc8d5cd0063a3e1ddd155b4e2280aeca16`

Raw local execution logs remain at `/private/tmp/studylist-qa27-*.log`.
This evidence must be committed and pushed before independent QA closes #27.
