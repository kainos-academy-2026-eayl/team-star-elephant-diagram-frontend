# team-star-elephant-diagram-frontend
Team Star Elephant Diagram Frontend

## Run with the backend

Use Node.js 22 and run `npm ci` in each repository. In the sibling backend repo,
start PostgreSQL with `docker compose up -d`, apply migrations with
`npm run db:deploy`, and run `npm run dev` with `PORT=3001` in its `.env`.

In this repository, set the following in your local `.env`:

```ini
PORT=3000
API_BASE_URL=http://localhost:3001
```

Run `npm run dev` here and open http://localhost:3000.
Registration redirects to login; successful login redirects to `/products`.
Forms display API validation errors without redisplaying passwords.
The catalogue loads stored products from the backend, with search and category
filtering. An empty database displays an empty catalogue. Product prices are
decimal pounds, formatted as GBP, and `imageURL` supports HTTP(S) images.

API calls run on the frontend server, not in the browser, so CORS is not needed.
Backend requests time out after five seconds and show an unavailable message.
Login currently checks credentials only; sessions, protected pages, and basket
persistence require separate backend functionality.

## Continuous integration

Use Node.js 22 (see [.nvmrc](.nvmrc)). To run the same checks as CI:

```sh
npm ci
npm run build
npm run lint
npm run format
npm test
```

[The CI workflow](.github/workflows/ci.yml) runs on pull requests (including
new commits and reopened PRs) and pushes to `main` or `master`, including merges.
It builds the TypeScript application, checks lint and formatting with Biome,
and runs the Vitest tests. A failed command fails the job.

Template filenames must match the casing used by `res.render()` exactly.
The Linux CI runner uses a case-sensitive filesystem; the page tests check
the filenames explicitly so casing mistakes are also caught on macOS.

### Required GitHub configuration

A workflow alone does not block merging. A repository administrator must:

1. Push this workflow and let it run so GitHub can discover its status check.
2. Open **Settings > Branches > Add branch protection rule** for `main`.
   Repeat for `master` if that branch is used.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select
   **Build, lint and test** from this workflow.
5. Enable **Require branches to be up to date before merging**.
6. Enable **Do not allow bypassing the above settings**, then save the rule.

With this rule enabled, a failed build, lint or test check prevents merging.
Verify it using a PR with an intentionally failing test; merging should be
blocked until the test is fixed and CI passes.

The backend needs its own workflow and required status check in its repository;
this frontend workflow does not protect backend pull requests.
