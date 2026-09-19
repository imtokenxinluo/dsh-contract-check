# dsh-contract-check

**Checks contract compliance. Does not detect malware, does not block anything.**

This plugin answers one question: **are the plugins currently installed violating DSH's
kernel contracts** — i.e. is the bug that corrupts session history still buried somewhere?

- ✅ Finds: `render()` returning a bare string (makes an entire session history unloadable),
  and plugins writing session event types outside the kernel vocabulary
- ❌ Does not find: deliberate poisoning, data exfiltration, backdoors.
  **An in-process checker has the same privileges as a malicious plugin** — it cannot stop one
- ❌ Blocks nothing: it only warns (a deliberate choice). You decide what to do about a violation

> 中文文档（更详细）：[`README.md`](./README.md)

---

## Zero token cost (hard constraint)

**This plugin registers no model tools, injects no prompt sections, and produces no
model-visible output.**

Its only outward signal is `ctx.logger.warn(...)` — console/log only, never model context.
So it has **zero effect** on your per-turn token usage.

This is a hard constraint, not a coincidence: a model tool's definition (name + description +
argument schema) enters **every request** — tens of thousands of tokens over a long
conversation, **whether or not the tool is ever used**. Anything that needs the agent to
"know about it" pays that tax, so this plugin will never add a model tool.

The GUI indicator is browser-side code and never enters model context, so the cost stays zero.

---

## Why this exists

DSH's write path is permissive and its read path is strict, and the failure mode is
**the whole session**, not just the offending record:

| Contract | Cost of violating it | Real incident |
|---|---|---|
| `output.render()` must return `ContentBlock[]` | Loader throws `SessionPersistenceCorruptionError`; **the entire history becomes unopenable** | 2026-09: `dsh-ssh-ops`'s `sftp_*` / `tunnel_*` returned bare strings; several sessions went dark |
| session event types must be in `KNOWN_SESSION_EVENT_TYPES` | Loader **refuses to interpret the whole log** ("unknown to this harness and not marked ignorable") | Reported repeatedly in the community (`dsh-agent-teams` et al.) |

The second one has a **hard fact that is easy to miss** (verified against kernel source):

- The loader's check is one line:
  `if (KNOWN_SESSION_EVENT_TYPES.has(event.type) || event.ignorable === true) continue;`
- The vocabulary has **44** types on 0.1.0-rc.6
- **`Session.append(type, data, ...opts)` accepts only `sourceEventSeqs` / `surfaceOp`
  — plugins have no way to set `ignorable`**; and no `ignorable: true` assignment
  exists anywhere in the kernel

**So: a plugin writing one custom event name makes the user's session unopenable,
and its author cannot fix it from their own side.**

---

## How it compares (so you don't install two of the same thing)

The DSH community already has plugin auditing tools. **This is not the first one.**

| | [`omdsh-dev/dsh-plugin-check`](https://github.com/omdsh-dev/dsh-plugin-check) | this tool |
|---|---|---|
| What it scans | **plugin repo on disk** (pre-publish) | **the live tool registry** (post-install) |
| What it checks | manifest protocol / patch format / build traps / hub listing / ecosystem compliance, **33 checks** | just two: the `render` contract, the session event vocabulary |
| Breadth | wider (packaging, naming, patches, hub status) | narrower (but deeper) |
| Minified / source-less plugins | invisible (it reads source trees) | **still visible** (it reads registry definitions) |
| GUI status indicator | ❌ | ✅ |
| Token cost | ⚠️ registers a model tool `plugin_check` (schema tax on every request) | **0** |

**Use `dsh-plugin-check` before publishing. Use this one after installing.**
They are complementary: theirs asks "is this correct before it goes out",
this one asks "is something burying a landmine in my running harness".

---

## GUI indicator

After installing into a profile and restarting, a small button appears in the
**session header**: a colored dot plus `体检` (means "health check").

**Hover** it for the full status line:

```
🟢 无耗 · 检查 21 个插件 · 违规 0 · 不可判定 1
```

- `无耗` ("zero-cost") comes first on purpose: this check spends no tokens.
- `违规 0` and `不可判定 1` are shown even when zero — a number disappearing reads as
  "this item wasn't checked".

**That button is the entire UI.** No tab, no panel. Checking is background work and should
not require you to go open a tab; it runs on load and whenever the tool registry changes.
The button is just the "confirm right now" entry point. Clicking it spins the dot for
at least 0.5s (a faster check would otherwise just flash).

A **Settings** page gains one section, `无耗检查`, containing a voluntary tip jar
(only shown if `dsh-tip-jar` is installed). It lives in Settings rather than in daily
view because it has nothing to do with checking.

| Color | Meaning |
|---|---|
| 🟢 green | checked, **0 violations**, and something was **actually verified** — healthy |
| 🟡 yellow | checked, **violations found** — some plugin risks corrupting sessions |
| ⚪ grey | not yet checked / cannot enumerate / everything undecidable — honestly "don't know" |

`unknown` **does not affect the color**: it means "can't tell", not "something is wrong".
Counting it as risk would paint the indicator yellow every day until you stop looking at it.

One exception (learned the hard way): **if all 21 plugins are undecidable, that is not
"healthy", it is "nothing was verified"** — the dot goes grey and the status line says so.
**Green must mean "something was really verified".**

---

## Two ways to use it

### 1) Install into a profile (in-process check)

```jsonc
// profiles/<profile>/package.json
{
  "dependencies": { "dsh-contract-check": "^0.1.0" },
  "dsh": { "profile": { "bundles": ["...", "dsh-contract-check"] } }
}
```

It then does three things:

- **on load**: enumerates tool definitions visible via `ctx.tools.view()` and checks each `output.render`
- **at runtime**: subscribes to `session/event` and warns immediately on an out-of-vocabulary type
- **GUI**: serves the two status routes the header button reads

> Plugin registration order is not controllable, so it also listens on `tools/change`:
> if the registry is still empty at load time it stays quiet and re-checks when it changes
> (each distinct problem warns once — no log spam).

### 2) Offline checks (no DSH needed)

```bash
dsh-contract-check scan <file-or-dir>    # recursively scan render definitions in source
dsh-contract-check package <pkg-dir>     # would npm packaging drop files the manifest needs?
dsh-contract-check vocab                 # print embedded vocabulary version and size
```

`package` targets the "whole plugin tree refuses to start" class of incident:
files declared in `package.json` (`dsh.bundle.patch` / `exports` targets / `types`)
that the `files` allowlist leaves out of the tarball.

> ⚠️ **This is the lightweight version** — it covers only that one class.
> For full pre-publish repo auditing (33 checks) use
> [`omdsh-dev/dsh-plugin-check`](https://github.com/omdsh-dev/dsh-plugin-check).
> This tool's focus is always the **running registry** and the **contracts that make
> sessions unopenable**.

It follows npm's **real semantics** (established by experiment, not guesswork):

| npm behavior | Files |
|---|---|
| **always included** | `package.json`, `README*`, `LICENSE*`, `CHANGELOG*`, `main` target, `bin` targets |
| **not automatic** (must be in `files`) | `exports` targets, `types`, **any custom field** — including `dsh.bundle.patch` |
| no `files` field at all | everything is packed; nothing can be dropped |

It **does not run npm** and **does not execute the inspected package's scripts** —
`npm pack` runs `prepack`/`prepare`, which is dangerous for untrusted packages,
so the allowlist logic is implemented here instead.

Exit code is `1` on violation, so it can be wired into scripts or CI.

---

## Three-state verdicts: why `unknown` exists

| Verdict | Meaning |
|---|---|
| `ok` | return shape is correct (statically visible, or confirmed by execution) |
| `violation` | returned a string / non-array / `undefined` (statically caught, or confirmed) |
| `unknown` | **can't tell** (static analysis blind *and* execution failed) — said honestly |

**Prefer `unknown` over `violation`** is this tool's hardest rule: a false positive
makes people uninstall good plugins and never trust the checker again. So:
**an exception thrown while probing is always `unknown`** (that means the fake data did not
match the schema — the checker's own problem), and **all-undecidable shows grey, not green**
("nothing was verified" ≠ "healthy").

Notable implementation consequences (all locked by tests):

- Chain expressions are typed by their **last producer, at bracket depth 0**:
  `[{ text: lines.join("\n") }]` is an array (`.join` is *inside* the array), while
  `[...].join("")` is a string
- **Nested function bodies are stripped** before collecting `return` statements:
  a `return "x"` inside a callback or local function is not `render`'s return value
- Only the function's **own** arrow counts: `render(a, v) { ...map((i) => ...) }` is a method
  shorthand, not an arrow function, just because its body contains `=>`
- Probing **synthesizes schema-shaped fake values** from `output.schema` (required fields,
  arrays, nested objects, depth-capped); a self-referential pathological schema will not hang it

---

## Accuracy: static + probe

Static analysis alone is structurally blind for most real plugins. The kernel's `defineTool`
wraps the author's `render`:

```js
// this is all static analysis ever sees — the body just calls someone else
render(args, value) { return userRender(args, value); }
```

Measured on a real installation: **21/21 undecidable** with static analysis alone
(= effectively no checking). So the live probe is **on by default** (`probeRender: false`
disables it), which brings it to 20 decidable, 1 honestly undecidable.

The probe calls `render` once with synthesized data and inspects the return value.
**A thrown exception is never a violation** — it means the synthesized data did not fit the
schema, which is the checker's problem, so it is reported as `unknown`.

### Field evidence (zero false positives)

`npm run verify:real` runs against **real installed code**:

```
real code: render=52, false-positive violations=0
synthetic samples: violations=2 (must be > 0, proving detection works)
```

- Covers **19 kernel tool packages** (kernel tools are necessarily compliant, so any
  violation would be our false positive)
- Covers real third-party plugins: `dsh-ssh-ops@0.2.1` — **15 renders, 0 violations**
  (that version is fixed; the pre-fix code returned bare strings, exactly the class of
  incident this project exists to prevent)

The packaging check was validated by **reproducing the real historical bug** that motivated it:
running it against `dsh-session-doctor`'s pre-fix commit flags `cordis.patch.yml` as missing
from the `files` allowlist — **the very bug that made the whole plugin tree refuse to start**.
Across 8 real installed packages, 7 are `ok` (zero false positives); the single hit,
`@opendsh/dsh-plugin-scheduled-tasks`, is a **genuine defect**: it exports `"./src/*": "./src/*"`
while `src` is not in `files`, so that import fails after install.

---

## Limitations (honestly)

1. **Static analysis has blind spots**: return values assembled at runtime, heavily obfuscated
   code → `unknown`, which is not the same as "fine"
2. **No malware detection**: a plugin that satisfies every contract can still exfiltrate data.
   That needs out-of-process isolation and permissions, which is out of scope here
3. **No blocking**: violations only warn. Blocking would mean registering a `tools.guard()`
   pre-execute hook — that affects normal operation and is a separate decision
4. **The vocabulary is versioned**: the embedded table comes from
   `@deepseek-ai/dsh-session@0.1.0-rc.6`. After upgrading DSH run `npm run verify:vocab`;
   if it drifts, `npm run gen:vocab` regenerates it (then review the diff)
5. **The probe executes plugin code once** (on by default, can be disabled).
   It catches thrown exceptions and never reports them as violations
6. **Out of scope**: packaging allowlists (a property of the package on disk — use
   `npm pack --dry-run`; the registry cannot see it), and runtime behaviors such as
   killing the host process
7. **Live status (2026-09-19)**: mounted and running in a real DSH — the header button shows
   `无耗 · 检查 21 个插件 · 违规 0 · 不可判定 1`. Two things stated plainly:
   - **The yellow path has not been exercised end-to-end on a live install yet.**
     Only green has been observed live; the yellow logic is unit-tested, but
     "install a broken plugin → indicator turns yellow → it names the plugin" has not been run.
   - The first check's log line has not been verified (DSH prints to the console that launched it),
     and whether `tools/change` reaches this plugin is unverified — so it additionally
     **re-checks once on first session traffic** as a fallback

---

## Design tradeoffs

- **Why warn instead of block**: blocking means a false positive **directly disrupts your work**.
  This tool's first goal is zero false positives, which is a moving target; when the two
  conflict, it chooses not to intervene. A blocking mode can be added later behind an explicit flag.
- **Why it isn't an anti-poisoning tool**: an in-process checker has the same privileges as the
  code it inspects, so it cannot defend against it; marketing it as a security tool would give
  **false reassurance**, which is worse than not shipping it.
- **Why this is a separate package from `dsh-session-doctor`**: different trust domains —
  the doctor handles *your own sessions*, this tool inspects *other people's packages*.

---

## Development

```bash
npm run build         # build the client bundle lib/client.js (required after editing src/client.js)
npm test              # 168 tests
npm run verify:real   # zero-false-positive acceptance run on real code
npm run verify:vocab  # vocabulary drift check
```

Zero runtime dependencies; tests use only Node's built-in `node:test`.

`npm test` also verifies a **source fingerprint** stamped into the bundle: editing
`src/client.js` without rebuilding fails the tests, so users can never get a stale UI.

CI (`.github/workflows/test.yml`) runs the same tests on push and pull requests with
`permissions: contents: read` and **no `npm install` step at all** — with zero dependencies
there is no install-time script risk surface.

## License

MIT
