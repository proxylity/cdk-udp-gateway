# Implementation Plan — Toolchain Modernization (@proxylity/cdk-udp-gateway)

Scope: TOOLING ONLY. Do NOT change construct source behavior or the public API. No edits to
`src/**` logic, no changes to `.jsii` by hand, no changes to peerDependencies or the deliberate
devDependency point-pins `aws-cdk-lib 2.160.0` / `constructs 10.0.0` (lowest-supported-version test
pins — leave AS-IS).

## Confirmed version triple (investigated against the npm registry on the dev box)

jsii constrains TypeScript via a hard `dependencies.typescript` range. `jsii@5.9.56` (latest 5.9.x)
declares `typescript: ~5.9`, so TypeScript MUST be `~5.9`. typescript-eslint v8 peer range is
`eslint ^8.57.0 || ^9.0.0 || ^10.0.0` and `typescript >=4.8.4 <6.1.0`, so TS 5.9 and eslint 9 are
both inside it. Chosen, exact:

| Package | Current | New (pin) | Latest observed | Why |
|---|---|---|---|---|
| `jsii` | `~5.5.0` | `~5.9.0` | 5.9.56 | Supported line; not EOS 5.5, not 6.0. |
| `jsii-pacmak` | `~1.103.0` | `~1.140.0` | 1.140.0 | Latest 1.14x; pacmak stays on 1.x with jsii 5.9. |
| `typescript` | `~5.5.0` | `~5.9.0` | 5.9.3 | Forced by jsii 5.9 `dependencies.typescript: ~5.9`. |
| `eslint` | `^8.57.0` | `^9.0.0` | 9.39.5 | eslint 9 flat config. |
| `@typescript-eslint/eslint-plugin` | `^7.18.0` | REMOVE | — | Replaced by unified package. |
| `@typescript-eslint/parser` | `^7.18.0` | REMOVE | — | Replaced by unified package. |
| `typescript-eslint` (NEW) | — | `^8.0.0` | 8.71.2 | Unified v8 flat-config helper (`tseslint.config`). |
| `@types/node` | `^20.14.0` | `^22.0.0` | 22.20.5 | CI Node pinned to 22. |
| `jest` / `ts-jest` / `@types/jest` | 29 line | KEEP 29 | — | No forcing reason; avoid churn. |
| `aws-cdk-lib` (dev + peer) | 2.160.0 / ^2.160.0 | UNCHANGED | — | Deliberate floor pin. |
| `constructs` (dev + peer) | 10.0.0 / ^10.0.0 | UNCHANGED | — | Deliberate floor pin. |

Decision — unified `typescript-eslint` package over separate plugin+parser: the v8 unified package
ships `tseslint.config()` and `tseslint.configs.recommended`, which is the documented, lowest-friction
path to a flat config and removes two separate deps. This is the one viable choice taken here.

## Windows execution notes (apply to every verification step)

- Judge success by stdout/stderr CONTENT, not exit code (PowerShell often returns -1 on success and
  echoes commands char-by-char). If a command seems to print nothing, redirect `... *> out.log` and
  read the file back, then delete the log.
- Prefer `npm.cmd` / `npx.cmd` over bare `npm` / `npx` if a bare call hits a PowerShell
  script-execution error.
- Do NOT install/repair Node. Toolchain is Node v24.20.0 / npm 11.19.0 and works. CI pins Node 22;
  local verification on Node 24 is expected and fine.
- `scripts/*.sh` are bash; run them via git-bash (`& "C:\Program Files\Git\bin\bash.exe" scripts/checks.sh`),
  not PowerShell.
- Clean up any temp `*.log` files you create.

---

## Baseline to capture BEFORE editing (for before/after reporting)

- [ ] 0. Record the pre-change `npm audit` count so the final report can compare. Expected baseline
      per the task brief is 50 vulnerabilities (9 moderate, 41 high); confirm the actual current
      number on this machine.
      Files: none (read-only).
      Verify: `npm.cmd audit *> audit-before.log` then read the summary line; note the counts; delete
      the log. (Informational only — do not act on audit here.)

---

## 1. package.json dependency + script edits

- [ ] 1. Update `devDependencies` and the `lint` script in `package.json`. Set `jsii` to `~5.9.0`,
      `jsii-pacmak` to `~1.140.0`, `typescript` to `~5.9.0`, `eslint` to `^9.0.0`, `@types/node` to
      `^22.0.0`. REMOVE `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`; ADD
      `typescript-eslint` at `^8.0.0`. Leave `aws-cdk-lib` (2.160.0), `constructs` (10.0.0),
      `jest`/`ts-jest`/`@types/jest` (29 line) UNCHANGED. Leave `peerDependencies` UNCHANGED. Change
      the `lint` script from `eslint --ext .ts src test` to `eslint src test` (eslint 9 flat config
      rejects `--ext`; file selection is governed by the flat config's `files`/`ignores`). Leave all
      other scripts (`compile`, `watch`, `build`, `package`, `test`) UNCHANGED.
      Files: `package.json`
      Verify: file is valid JSON (`npm.cmd pkg get devDependencies *> pkg.log`; read back shows the
      new versions and no `@typescript-eslint/*`); delete the log. Full install/lint verification
      happens in later steps.

## 2. eslint 9 flat-config migration (the non-trivial piece)

- [ ] 2. Create `eslint.config.mjs` (ESM extension because the package is CommonJS, so a `.js` flat
      config would be parsed as CJS and `import` would fail). Port the `.eslintrc.json` config
      FAITHFULLY — do not drop rules or loosen to make lint pass. Mapping:
      - `root: true` → implicit in flat config (no `extends` chain walk); no equivalent needed.
      - `extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"]` →
        spread `eslint.configs.recommended` (from the `eslint` package's `js`/`@eslint/js`) and
        `tseslint.configs.recommended` via `tseslint.config(...)`.
      - `parser: "@typescript-eslint/parser"` + `parserOptions` (`ecmaVersion: 2020`,
        `sourceType: "module"`, `project: "./tsconfig.dev.json"`) → `languageOptions.parser =
        tseslint.parser` with `parserOptions: { ecmaVersion: 2020, sourceType: "module", project:
        "./tsconfig.dev.json", tsconfigRootDir: import.meta.dirname }`.
      - `plugins: ["@typescript-eslint"]` → provided by `tseslint.configs.recommended` /
        `tseslint.plugin`.
      - `env: { node: true, jest: true }` → `languageOptions.globals` using the `globals` package
        (`globals.node`, `globals.jest`). If adding the `globals` dep is undesirable, define the
        minimal globals inline; prefer the `globals` package (add `globals` as a devDependency) for
        fidelity. (Decision: add `globals` devDep — it is the standard flat-config way to reproduce
        `env` and keeps intent exact.)
      - `ignorePatterns: ["*.js", "lib/**", "dist/**", "node_modules/**"]` → a leading config object
        with `ignores: ["**/*.js", "**/*.mjs", "lib/**", "dist/**", "node_modules/**"]`. (eslint 9
        ignores `node_modules` by default, but keep it explicit for parity. Ignore `*.mjs` too so the
        flat config file itself is not type-checked by the project parser.)
      - `rules`: `@typescript-eslint/no-explicit-any: "off"` and
        `@typescript-eslint/explicit-module-boundary-types: "off"` → carry verbatim into a `rules`
        block scoped to the TS files.
      - `files`: scope the TS/type-checked block to `["src/**/*.ts", "test/**/*.ts"]` so lint targets
        exactly the sources `--ext .ts src test` used to. The config MUST lint a NON-ZERO number of
        files.
      Shape (CommonJS package → `.mjs`, use `tseslint.config`):
      ```js
      // eslint.config.mjs
      import js from '@eslint/js';
      import tseslint from 'typescript-eslint';
      import globals from 'globals';

      export default tseslint.config(
        { ignores: ['**/*.js', '**/*.mjs', 'lib/**', 'dist/**', 'node_modules/**'] },
        js.configs.recommended,
        ...tseslint.configs.recommended,
        {
          files: ['src/**/*.ts', 'test/**/*.ts'],
          languageOptions: {
            parserOptions: {
              ecmaVersion: 2020,
              sourceType: 'module',
              project: './tsconfig.dev.json',
              tsconfigRootDir: import.meta.dirname,
            },
            globals: { ...globals.node, ...globals.jest },
          },
          rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
          },
        },
      );
      ```
      Note: `@eslint/js` ships inside the `eslint` package; if importing `@eslint/js` fails to
      resolve, add `@eslint/js` (matching eslint's version line) as a devDependency. The unified
      `typescript-eslint` package re-exports `parser`, `plugin`, `configs`, and `config`.
      Files: `eslint.config.mjs` (new), and `package.json` (add `globals` devDep, and `@eslint/js` if
      needed).
      Verify: deferred to step 4 (`npm run lint`) after install; the config must report linting a
      non-zero file count with zero errors.

- [ ] 3. Delete `.eslintrc.json` and remove its reference from `.npmignore`. Flat config fully
      replaces it; a leftover `.eslintrc.json` is ignored by eslint 9 but is dead config. In
      `.npmignore`, remove the `.eslintrc.json` line and add `eslint.config.mjs` to the ignore list
      (the published package carries only `lib` + `.jsii` + `README.md`, so the flat config must not
      ship). Leave the `files` allowlist in `package.json` (`lib`, `.jsii`, `README.md`) UNCHANGED.
      Files: delete `.eslintrc.json`; edit `.npmignore`.
      Verify: `.eslintrc.json` no longer exists; `.npmignore` lists `eslint.config.mjs` and no longer
      lists `.eslintrc.json`.

## 3. Regenerate the lockfile and install

- [ ] 4. Regenerate `package-lock.json` for the new versions and install. Use `npm install` (NOT
      `npm ci`) because `npm ci` requires the lock to already match `package.json`. After it
      completes, run `npm run lint` to validate the flat config end-to-end.
      Files: `package-lock.json` (regenerated).
      Verify (judge by content, not exit code):
      1. `npm.cmd install *> install.log` → read back: resolves with the new versions, no peer-dep
         ERESOLVE failure. Delete the log.
      2. `npm.cmd run lint *> lint.log` → read back: eslint runs, lints a NON-ZERO number of `.ts`
         files under `src/`+`test/`, and reports zero errors (clean). If eslint reports it matched no
         files, that is a FAILURE — fix `files`/`ignores`. Delete the log.

## 4. CI buildspecs, scripts, and docs: Node 20 → 22, drop stale jsii-5.5 wording

- [ ] 5. Bump the CI Node runtime from 20 to 22 in all three buildspecs and remove the stale
      "jsii 5.5" phrasing in `scripts/checks.sh` while keeping the silence env var. Edits:
      - `build/checks.yml`: `runtime-versions.nodejs: 20` → `22`.
      - `build/package.yml`: `runtime-versions.nodejs: 20` → `22` (leave `python 3.12`, `dotnet 8.0`,
        `java corretto21`, `golang 1.21` UNCHANGED).
      - `build/publish.yml`: `runtime-versions.nodejs: 20` → `22`.
      - `scripts/checks.sh`: the comment "jsii 5.5 warns loudly when run on an untested Node major"
        → reword to drop the version-specific "5.5" (e.g. "jsii warns loudly on an untested Node
        major"); KEEP `export JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1`. Do not change the
        command sequence (`npm ci; npm run lint; npm run compile; npm test`).
      - `scripts/package.sh`: KEEP `JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION=1`; no Node-version
        string to change here — leave the command flow intact.
      - `README.md`: search for any `Node 20`, `nodejs 20`, `jsii 5.5`, or `typescript 5.5`
        references and correct them to Node 22 / jsii 5.9 / TypeScript 5.9. (Grep found no obvious
        matches, so this may be a no-op; confirm by searching before editing. Do not invent new
        documentation.)
      Files: `build/checks.yml`, `build/package.yml`, `build/publish.yml`, `scripts/checks.sh`,
      `scripts/package.sh` (if any ref), `README.md` (if any ref).
      Verify: re-read each file and confirm `nodejs: 22` in all three buildspecs; `grep -rn "nodejs: 20"`
      over `build/` returns nothing; `scripts/checks.sh` keeps the silence export and no longer says
      "5.5".

## 5. Full verification sequence (the acceptance gate)

- [ ] 6. Compile with jsii 5.9 and confirm the EOS banner is gone. The jsii 5.5 "End-of-Support"
      banner that appeared in the CI log must NOT appear with 5.9.
      Files: none (produces `lib/` + `.jsii`).
      Verify: `npm.cmd run compile *> compile.log` → read back: zero `error TS...` lines; no
      "5.5 release line of jsii has reached End-of-Support" banner. (A Node EOL banner may still
      appear if run on an unsupported Node, but on Node 24 with the silence var it should be quiet;
      the jsii-version EOS banner specifically must be gone.) Delete the log.

- [ ] 7. Run the full test suite; counts must match the known-good baseline and the golden synth-diff
      must pass unchanged. Baseline is 27 tests across 5 suites
      (`test/cfn-destination-arn.test.ts`, `test/cfn-listener.test.ts`,
      `test/cfn-packet-source.test.ts`, `test/proxylity-config.test.ts`,
      `test/synth/packet-counter.golden.test.ts`). The golden test diffs synth output against
      `c:\Users\leeha\source\proxylity\examples\packet-counter\packet-counter.template.json` and must
      remain green — a drift here means behavior changed, which is out of scope.
      Files: none.
      Verify: `npm.cmd test *> test.log` → read back: all 5 suites pass, 27/27 tests pass (confirm
      the actual counts; if they legitimately differ, report the real numbers). The
      `packet-counter.golden` suite passes with no snapshot/template diff. Delete the log.

- [ ] 8. Confirm the lockfile is in sync by dry-running the CI install path. After `npm install` in
      step 4, `npm ci` must succeed against the regenerated lock.
      Files: none.
      Verify: `npm.cmd ci *> ci.log` → read back: installs from lock with no "lock file" mismatch
      error. Delete the log. (This re-materializes `node_modules`; that is fine.)

- [ ] 9. Produce language artifacts with jsii-pacmak and confirm js/python/dotnet land under `dist/`.
      Java and Go MAY fail locally for missing Maven/Go toolchains — that is EXPECTED and not a
      failure of this task; capture which targets produced output.
      Files: none (produces `dist/js`, `dist/python`, `dist/dotnet`, and `dist/java` / `dist/go` if
      toolchains present).
      Verify: `npm.cmd run package *> package.log` → read back: `dist/js` (npm tarball),
      `dist/python` (wheel+sdist), and `dist/dotnet` (nupkg) are produced. If Java/Go error for
      missing toolchains, note it and treat as expected. Delete the log.

- [ ] 10. Exercise the CI check script end-to-end via git-bash to prove `scripts/checks.sh` works as
      CodeBuild will run it (`npm ci; npm run lint; npm run compile; npm test`).
      Files: none.
      Verify: `& "C:\Program Files\Git\bin\bash.exe" scripts/checks.sh *> checks.log` → read back:
      lint clean, compile clean (no jsii-5.5 EOS banner), all tests pass. Delete the log.

- [ ] 11. Report the `npm audit` delta. Capture the post-change count and compare to the step-0
      baseline (brief states 50: 9 moderate, 41 high).
      Files: none.
      Verify: `npm.cmd audit *> audit-after.log` → read back the summary; state before vs after
      counts in the final report. Delete the log. (Do not run `npm audit fix` — out of scope; report
      only.)

## Gaps / assumptions (noted, not blocking)

- `tsconfig.json` carries `_generated_by_jsii_` and is regenerated by `jsii --silence-warnings` on
  compile; do NOT hand-edit it. If jsii 5.9 rewrites it on first compile, that regenerated diff is
  expected and acceptable (tooling-generated, not a behavior change).
- README had no grep hits for `Node 20` / `jsii 5.5` / `typescript`; step 5's README edit is likely a
  no-op. Confirm with a search before editing; do not add new docs.
- `globals` (and possibly `@eslint/js`) are added as devDependencies to reproduce `env` and
  `eslint:recommended` faithfully in flat config. These are standard flat-config companions, pinned
  to current majors by `npm install`.
- Go module output is source-only (`go.mod`) and often succeeds without a full Go toolchain; Java
  (Maven) is the target most likely to fail locally. Either failing locally is expected per the brief.
```
