# New Vite Project Setup Guide

A reusable walkthrough for starting any new Vite project with:

1. A visible app that runs locally
2. Lint, typecheck (TypeScript projects) and build scripts
3. A GitHub repo with **CI that runs lint and build on every push** (results visible in the repo's **Actions** tab)
4. **Cloudflare deployment** through Wrangler

Follow the sections in order. Each ends with a **Checkpoint** so problems get caught early. Steps marked **TS** apply only to TypeScript templates (`vanilla-ts`, `react-ts`); do them in addition to the plain steps, not instead of them.

> **Versions:** commands and config below were re-verified in October 2026 against create-vite 9.3, Vite 8.3, TypeScript 7.0 / 6.0, ESLint 10, typescript-eslint 8.72 and the `v7` GitHub Actions. Vite and Wrangler change often, so if something errors, check the linked official docs first (section 12).

---

## 0. Prerequisites

| Need                           | Notes                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| **Node.js 22 LTS** (or 20.19+) | Current Vite requires Node 20.19+ or 22.12+. Check with `node -v`.                     |
| **npm**                        | Ships with Node. pnpm or yarn also work, but adjust the commands and CI cache setting. |
| **Git**                        | `git --version`                                                                        |
| **GitHub account**             | Optionally the GitHub CLI (`gh`) for creating the repo from the terminal.              |
| **Cloudflare account**         | Free tier is enough.                                                                   |

---

## 1. Scaffold the project

```bash
npm create vite@latest my-app -- --template vanilla
cd my-app
npm install
```

Template choices (`--template`):

| Template             | Use for          |
| -------------------- | ---------------- |
| `vanilla`            | Plain JavaScript |
| `vanilla-ts`         | Plain TypeScript |
| `react` / `react-ts` | React (JS / TS)  |

Use `.` as the project name to scaffold into the current (empty) directory.

What the templates do **not** include (as of create-vite 9.3):

- `vanilla` / `vanilla-ts`: no linter at all. You add ESLint in section 3.
- `react-ts`: ships **oxlint**, not ESLint. Either keep oxlint or replace it with section 3; don't run both.
- TS templates ship **TypeScript 7** (the native Go compiler). It has no JavaScript API yet, so `typescript-eslint` cannot load it. Section 3.1 (TS) pins TypeScript 6 to fix this.

**Pin the Node version** so local and CI match. Create `.nvmrc`:

```
22
```

And add to `package.json`:

```json
"engines": { "node": ">=20.19" }
```

**Pin line endings** (important on Windows). Prettier expects LF, and Git on Windows may check files out as CRLF, which makes `format:check` fail locally but pass on CI (or the reverse). Create `.gitattributes`:

```
* text=auto eol=lf
```

### Checkpoint

```bash
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). You should see the default Vite page.

---

## 2. Make the app visibly yours

The default template page is fine to start, but replacing it with something that proves the build and deploy pipeline works saves confusion later. This "hello" page shows the mode and build time, so you can tell at a glance that a deployed page is the latest build.

**`index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

**`src/main.js`**

```js
import './style.css';

const app = document.querySelector('#app');

app.innerHTML = `
  <main>
    <h1>My App</h1>
    <p>It works.</p>
    <button id="counter" type="button">Clicked 0 times</button>
    <small>mode: ${import.meta.env.MODE} · built: ${__BUILD_TIME__}</small>
  </main>
`;

let count = 0;
const button = document.querySelector('#counter');
button.addEventListener('click', () => {
  count += 1;
  button.textContent = `Clicked ${count} times`;
});
```

**`src/style.css`**

```css
:root {
  font-family: system-ui, sans-serif;
  color-scheme: light dark;
}
body {
  margin: 0;
  display: grid;
  min-height: 100vh;
  place-items: center;
}
main {
  text-align: center;
}
button {
  padding: 0.5rem 1rem;
  font-size: 1rem;
  cursor: pointer;
}
small {
  display: block;
  margin-top: 1rem;
  opacity: 0.6;
}
```

**`vite.config.js`** (injects a build timestamp)

```js
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
```

Delete the unused template files (`src/counter.js`, template SVGs, and the default `public/` icons if not needed).

> **ESLint note:** `__BUILD_TIME__` is a global defined by Vite. It is declared in the ESLint config in section 3 so `no-undef` doesn't flag it.

### 2.1 TS: TypeScript version of the page

Don't paste the JavaScript above into `.ts` files. It builds (Vite doesn't typecheck), but `tsc` rejects it: `querySelector` can return `null`, and TypeScript doesn't know `__BUILD_TIME__`. Use these instead:

**`index.html`**: same as above, but the script must point at the `.ts` file:

```html
<script type="module" src="/src/main.ts"></script>
```

**`src/main.ts`**

```ts
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app element not found');

app.innerHTML = `
  <main>
    <h1>My App</h1>
    <p>It works.</p>
    <button id="counter" type="button">Clicked 0 times</button>
    <small>mode: ${import.meta.env.MODE} · built: ${__BUILD_TIME__}</small>
  </main>
`;

const button = app.querySelector<HTMLButtonElement>('#counter');
if (!button) throw new Error('#counter button not found');

let count = 0;
button.addEventListener('click', () => {
  count += 1;
  button.textContent = `Clicked ${count} times`;
});
```

**`src/vite-env.d.ts`** (declares globals that `define` injects; add one line per global)

```ts
// Globals injected by `define` in vite.config.ts
declare const __BUILD_TIME__: string;
```

**`vite.config.ts`**: same content as `vite.config.js` above, with a `.ts` name.

**`tsconfig.json`**: keep the template's file and make two changes: add `"strict": true` under `compilerOptions` (it's already the default, but say it explicitly), and typecheck the Vite config too:

```json
"include": ["src", "vite.config.ts"]
```

Delete `src/counter.ts` and `src/assets/` (template leftovers).

### Checkpoint

`npm run dev` shows the page, the button counts, and the footer shows a build time. **TS:** `npx tsc --noEmit` prints nothing.

---

## 3. Linting (and optional formatting)

### 3.1 ESLint

```bash
npm install -D eslint @eslint/js globals
```

All three packages are required. `@eslint/js` is only the rule preset; it does **not** install the `eslint` command. Confirm the local install, not a global one:

```bash
npm ls eslint            # must list eslint@10.x directly under your project
npx --no-install eslint --version
```

If `npm ls eslint` shows `(empty)` but `eslint .` still runs, a global ESLint is hiding the missing dependency, and CI fails with `sh: 1: eslint: not found` (exit code 127).

**`eslint.config.js`** (flat config, JavaScript projects)

```js
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules', '.wrangler', 'coverage'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __BUILD_TIME__: 'readonly',
      },
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
```

This config only matches `**/*.js`. In a TypeScript project it lints **zero** `.ts` files and still passes, so use 3.1 (TS) instead.

### 3.1 (TS) ESLint for TypeScript

typescript-eslint needs the TypeScript JavaScript API, which TypeScript 7 doesn't have yet (the peer range is `typescript >=4.8.4 <6.1.0`). Installing it next to the template's `typescript@~7.0.2` fails with `npm error ERESOLVE ... peer typescript@">=4.8.4 <6.1.0"`. Pin TypeScript 6 in the same command:

```bash
npm install -D typescript@~6.0.3 eslint @eslint/js typescript-eslint globals
```

TypeScript 6 typechecks the same code; you lose only TS 7's speed. Move back to 7 once typescript-eslint supports it ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). Don't use `--legacy-peer-deps` or `--force` to get around the error: the install succeeds, but ESLint then crashes on startup.

**`eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.wrangler']),
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
]);
```

Notes:

- No `__BUILD_TIME__` entry is needed. typescript-eslint turns off `no-undef` for TS files because `tsc` already checks undefined names, and `src/vite-env.d.ts` declares the global (section 2.1).
- `node_modules` is ignored by default in flat config, so it isn't listed.
- Add any generated folders (for example a connection-map output folder) to `globalIgnores`.

### 3.2 Prettier (optional but recommended)

```bash
npm install -D prettier
```

**`.prettierrc`**

```json
{ "singleQuote": true, "semi": true }
```

**`.prettierignore`**

```
dist
node_modules
package-lock.json
```

### 3.3 Scripts

In `package.json`, set `scripts`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "ci": "npm run lint && npm run format:check && npm run build"
}
```

`npm run ci` is a local mirror of the CI pipeline. Run it before pushing.

If you skip Prettier, drop the `format:check` step from the `ci` script and from the workflow in section 6.

**TS:** add a `typecheck` script and run it first in `ci`. Vite's build strips types without checking them, so without this step type errors reach production unnoticed:

```json
"typecheck": "tsc --noEmit",
"ci": "npm run typecheck && npm run lint && npm run format:check && npm run build"
```

The TS templates set `"build": "tsc && vite build"`. Change it to plain `"vite build"`: `typecheck` now covers it, and CI shows type errors as a separate step.

### Checkpoint

```bash
npm run format        # normalize the scaffolded files once
npm run ci            # (typecheck +) lint + format check + build should all pass
```

Then prove the linter actually sees your source files. Add `const unused = 1;` to `src/main.js` (or `src/main.ts`), run `npm run lint`, and confirm it **fails** with `no-unused-vars` (or `@typescript-eslint/no-unused-vars`). Remove the line. A lint step that passes on everything is a silent failure, not a pass.

---

## 4. Git and GitHub repository

### 4.1 `.gitignore`

The Vite template generates one. Confirm it includes at least:

```
node_modules
dist
.wrangler
.dev.vars
.env
.env.*
!.env.example
*.local
```

`.wrangler/` and `.dev.vars` are created by Wrangler and must never be committed. `.dev.vars` may contain secrets.

### 4.2 Initialize and push

```bash
git init -b main
git add .
git commit -m "Initial Vite scaffold"
```

Create the GitHub repo either way:

**With the GitHub CLI**

```bash
gh repo create my-app --private --source=. --remote=origin --push
```

**Without it:** create an empty repo at github.com/new (no README, no .gitignore), then:

```bash
git remote add origin git@github.com:YOUR-USER/my-app.git
git push -u origin main
```

Commit `package-lock.json`. CI uses `npm ci`, which requires it.

### Checkpoint

The code is visible on GitHub.

---

## 5. Cloudflare and Wrangler setup

Cloudflare's current guidance for new static sites is **Workers with static assets**, configured through Wrangler. The older Cloudflare Pages product still exists, but this guide uses Workers so one tool (Wrangler) handles config, preview and deployment.

### 5.1 Install Wrangler in the project

```bash
npm install -D wrangler
npx wrangler login
```

`wrangler login` opens a browser to authorize your Cloudflare account. Verify with:

```bash
npx wrangler whoami
```

### 5.2 Wrangler config: `wrangler.jsonc`

Create `wrangler.jsonc` in the project root:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app",
  // Set this to the date you create the project. It pins Workers runtime behavior.
  "compatibility_date": "2026-09-24",
  "assets": {
    "directory": "./dist",
  },
}
```

Notes:

- **`name`** becomes the Worker name and the default URL: `my-app.<your-subdomain>.workers.dev`. Use lowercase letters, numbers and dashes.
- **No `main` field** is needed for a static site. There is no Worker code, only assets.
- **`assets.directory`** must point at Vite's build output, `./dist`.
- **Single-page apps with client-side routing** (React Router and similar): add SPA fallback so deep links don't 404:

  ```jsonc
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
  ```

  For a single-page vanilla app with no routes, leave this out.

- Keep `compatibility_date` fixed once set. Update it deliberately, not automatically.

If a Wrangler config is absent, Wrangler tries to auto-detect the framework, and that path can fail on older Vite versions. Having an explicit `wrangler.jsonc` avoids surprises.

### 5.3 Add scripts

Add to `package.json` `scripts`:

```json
"deploy": "npm run build && wrangler deploy",
"preview:cf": "npm run build && wrangler dev",
"cf:dry-run": "npm run build && wrangler deploy --dry-run"
```

| Script       | What it does                                                                    |
| ------------ | ------------------------------------------------------------------------------- |
| `preview:cf` | Serves the built site locally through Wrangler (closest to production behavior) |
| `cf:dry-run` | Validates config and asset upload without deploying                             |
| `deploy`     | Builds and publishes to Cloudflare                                              |

### 5.4 First deploy (manual)

```bash
npm run cf:dry-run     # confirms config and asset discovery
npm run deploy
```

Wrangler prints the live URL (`https://my-app.<subdomain>.workers.dev`).

### Checkpoint

Open the URL. The page loads and the footer shows the mode `production` and a build time.

### 5.5 Custom domain (optional)

Add a route in the config or use the Cloudflare dashboard (Workers & Pages, your Worker, Settings, Domains & Routes). The domain must be on your Cloudflare account.

```jsonc
"routes": [{ "pattern": "app.example.com", "custom_domain": true }]
```

---

## 6. Continuous integration with GitHub Actions

Goal: **every push and every pull request runs lint and build**, and the results show up under the repo's **Actions** tab, plus as check marks on commits and PRs.

### 6.1 The workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

# Cancel superseded runs on the same branch to save minutes
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci

      # TS projects only; delete this step for plain JavaScript
      - name: Typecheck
        run: npm run typecheck

      - name: ESLint
        run: npm run lint

      - name: Prettier check
        run: npm run format:check

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci

      - name: Build
        run: npm run build

      - name: Upload build output
        uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist
          retention-days: 7

  # Uncomment when the project has tests
  # test:
  #   name: Test
  #   runs-on: ubuntu-latest
  #   steps:
  #     - uses: actions/checkout@v7
  #     - uses: actions/setup-node@v7
  #       with:
  #         node-version-file: .nvmrc
  #         cache: npm
  #     - run: npm ci
  #     - run: npm test
```

Why it's shaped this way:

- **`on: push` with no branch filter** runs on every push to every branch. Pull requests get a second run against the merge result.
- **Separate `lint` and `build` jobs** run in parallel and appear as separate named checks, so a failure tells you which stage broke. Typecheck sits in the `Lint` job so the check names stay the same for branch protection (6.4).
- **`npm ci`** installs exactly what's in the lockfile (fast and reproducible). It's also why every tool a script calls (`eslint`, `tsc`, `prettier`, `vite`) must be in `devDependencies`: the runner has no global installs.
- **`node-version-file: .nvmrc`** keeps CI on the same Node version as local development.
- **Action versions** (`@v7`) are major-version pins. Use versions that run on Node 24: GitHub removed Node 20 from runners in September 2026, so the old `@v4` actions show deprecation warnings or fail. Let Dependabot keep them current (section 9).
- **`cache: npm`** is explicit on purpose. `setup-node` v6+ caches npm automatically only when `package.json` has a `packageManager` field; the explicit input works either way.

### 6.2 Push and view the results

```bash
git add .
git commit -m "Add CI workflow"
git push
```

Then in GitHub:

1. Open the repo and click the **Actions** tab.
2. Select the **CI** workflow, then the latest run.
3. You'll see **Lint** and **Build** jobs. Click one to expand its steps and logs.
4. A failed step shows in red with its log output. **Re-run failed jobs** is at the top right.

Also visible:

- A green check or red X next to each commit in the commit list
- Check status at the bottom of every pull request
- The downloadable **dist** artifact on the run summary page

### 6.3 Optional: status badge

Add to `README.md`:

```md
![CI](https://github.com/YOUR-USER/my-app/actions/workflows/ci.yml/badge.svg)
```

### 6.4 Optional: require checks before merging

In the repo: **Settings, Branches** (or **Rules, Rulesets**), add a rule for `main`:

- Require a pull request before merging
- Require status checks to pass: select **Lint** and **Build**

Private repos on free plans may not offer branch protection. Check GitHub's current plan limits.

### Checkpoint

The Actions tab shows a green **CI** run with Lint and Build both passing. To prove the checks catch failures, push a branch that introduces an unused variable and confirm **Lint** fails, then delete the branch.

---

## 7. Deployment options

Choose **one** deploy method per project so you don't deploy twice.

### Option A: Cloudflare Workers Builds (Git integration, simplest)

Cloudflare builds and deploys directly from GitHub. No secrets needed in GitHub.

1. Cloudflare dashboard, **Workers & Pages**, **Create**, **Import a repository**.
2. Authorize the GitHub app and choose the repo.
3. Set:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
4. Save. Each push to the production branch deploys. Non-production branches get preview builds, depending on your settings.

CI in GitHub Actions still runs lint and build independently. Cloudflare's own build status appears as a separate check on the commit.

### Option B: Deploy from GitHub Actions (CI-gated)

Deploys only after lint and build pass, from `main` only.

**Step 1: create a Cloudflare API token.** Cloudflare dashboard, **My Profile, API Tokens, Create Token**. Use the **Edit Cloudflare Workers** template, scoped to your account. Copy the token.

**Step 2: find your Account ID.** Dashboard, **Workers & Pages**, sidebar or overview (also shown by `npx wrangler whoami`).

**Step 3: add GitHub secrets.** Repo, **Settings, Secrets and variables, Actions, New repository secret**:

| Name                    | Value                 |
| ----------------------- | --------------------- |
| `CLOUDFLARE_API_TOKEN`  | The token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID       |

**Step 4: add a deploy job** to `ci.yml`:

```yaml
deploy:
  name: Deploy
  needs: [lint, build]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: production
  steps:
    - uses: actions/checkout@v7

    - uses: actions/setup-node@v7
      with:
        node-version-file: .nvmrc
        cache: npm

    - run: npm ci
    - run: npm run build

    - name: Deploy to Cloudflare
      run: npx wrangler deploy
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

The `needs` line makes a failing lint or build block the deploy. `if:` restricts deployment to pushes on `main`, so feature branches and PRs never deploy. The `environment: production` line is optional and gives a Deployments panel on the repo, and lets you add manual approvals later.

Never commit the token. It only lives in GitHub Secrets.

---

## 8. Environment variables

- **Build-time (frontend) variables** must be prefixed `VITE_` and are read with `import.meta.env.VITE_NAME`. They are **embedded in the public bundle**, so never put secrets in them.
- Commit an `.env.example` listing the names with dummy values. Keep real values in `.env.local` (git-ignored).
- For CI builds that need values, add them as GitHub **Variables** (non-secret) and expose them in the build step:

  ```yaml
  - run: npm run build
    env:
      VITE_API_URL: ${{ vars.VITE_API_URL }}
  ```

- Secrets for Worker code (if you later add a Worker) go in `.dev.vars` locally and `wrangler secret put NAME` for production.

---

## 9. Keeping dependencies and actions fresh (optional)

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      dev-dependencies:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

Dependabot PRs go through the same CI, so each update is validated by lint and build automatically.

---

## 10. Recommended final repo layout

```
my-app/
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   └── dependabot.yml          (optional)
├── public/                     static files copied as-is
├── src/
│   ├── main.js
│   └── style.css
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── wrangler.jsonc
└── README.md
```

---

## 11. Troubleshooting

| Symptom                                                        | Likely cause and fix                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm create vite` warns about Node version                     | Upgrade to Node 22 LTS (or 20.19+).                                                                                    |
| CI fails at `npm ci` with lockfile error                       | `package-lock.json` isn't committed or is out of sync. Run `npm install`, commit the lockfile.                         |
| CI passes locally but lint fails on Actions                    | Different Node or dependency versions. Use `.nvmrc`, `npm ci` locally, and run `npm run ci`.                           |
| `no-undef` for `__BUILD_TIME__` or similar                     | Declare the global in `eslint.config.js` under `globals` (section 3.1).                                                |
| Prettier check fails on CI                                     | Run `npm run format` locally and commit the result.                                                                    |
| `wrangler deploy` says assets directory not found              | The build didn't run or the path is wrong. `assets.directory` must be `./dist`. Run `npm run build` first.             |
| Wrangler tries to auto-configure and errors about Vite version | Add an explicit `wrangler.jsonc` (section 5.2) or upgrade Vite.                                                        |
| `wrangler` config error about `assets` missing `directory`     | Newer Wrangler requires `assets.directory`. Add it.                                                                    |
| Deployed page 404s on refresh at a sub-route                   | Add `"not_found_handling": "single-page-application"` (section 5.2).                                                   |
| Deploy job fails with authentication error (Option B)          | Check that both secrets exist and the token has Workers edit permission for the right account.                         |
| Deploy job never runs                                          | It only runs on pushes to `main`. Check the branch name and the `if:` condition.                                       |
| Blank page after deploy, assets 404                            | A non-root `base` in `vite.config.js`. For Workers at the domain root, leave `base` unset.                             |
| `Actions` tab shows nothing                                    | Workflow file must be at `.github/workflows/*.yml` on the pushed branch, and Actions must be enabled in repo Settings. |

---

## 12. Reference links

- Vite: https://vite.dev/guide/
- Cloudflare Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Vite framework guides: https://developers.cloudflare.com/workers/framework-guides/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- GitHub Actions: https://docs.github.com/actions
- Dependabot: https://docs.github.com/code-security/dependabot

---

## 13. New-project checklist

Copy this into each new project.

- [ ] `npm create vite@latest <name> -- --template <template>`
- [ ] `.nvmrc` and `engines` set
- [ ] Visible starter page working in `npm run dev`
- [ ] ESLint (and Prettier) installed; `lint`, `format:check`, `ci` scripts present
- [ ] `npm run ci` passes locally
- [ ] `.gitignore` covers `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `.env*`
- [ ] GitHub repo created and `main` pushed, lockfile committed
- [ ] `wrangler` installed, `wrangler login` done
- [ ] `wrangler.jsonc` created (`name`, `compatibility_date`, `assets.directory`)
- [ ] SPA fallback added if the app has client-side routes
- [ ] `npm run cf:dry-run` succeeds
- [ ] `npm run deploy` succeeds; live URL verified
- [ ] `.github/workflows/ci.yml` added and pushed
- [ ] Actions tab shows green **Lint** and **Build**
- [ ] Deployment method chosen (Workers Builds **or** Actions deploy job, not both)
- [ ] (Optional) CI badge, branch protection, Dependabot
- [ ] README documents the scripts and live URL

---

## 14. Adapting this guide

**React + TypeScript project (for example Starfruit):** scaffold with `--template react-ts`. The template ships its own ESLint config and a `tsc -b` build step, so keep those. Add the `ci` script, the workflow, and `wrangler.jsonc` exactly as above, with SPA fallback enabled because React Router uses client-side routes. Add `vitest` and a `test` job when tests exist, and Playwright as a later, separate job.

**Projects with a Python pipeline:** add a second workflow (for example `.github/workflows/pipeline.yml`) with `ruff` and `pytest`, triggered by `paths: ['pipeline/**']`, so frontend and data-pipeline checks stay independent.

**Large static data files:** files over Cloudflare's per-asset size limit shouldn't be bundled as static assets. Host them in R2 and load them at runtime, which keeps frontend deploys separate from data deploys.
