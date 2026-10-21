# team-star-elephant-diagram-frontend
Team Star Elephant Diagram Frontend

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
