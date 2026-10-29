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

Authenticated browser sessions require HTTPS because cookies are always Secure.
For local development, run `npm run dev:cert` once (requires OpenSSL), then add:

```ini
TLS_CERT_FILE=.certs/localhost.pem
TLS_KEY_FILE=.certs/localhost-key.pem
```

Restart `npm run dev` and open **https://localhost:3000/login**, not HTTP.
The generated certificate is self-signed: accept the certificate warning only
for this localhost development server, or use certificates from a trusted local
development CA instead. The generator does not modify the system trust store.
Certificates and private keys live in git-ignored `.certs/`; keep the private
key private and never deploy this development certificate to production.

Both TLS variables must be configured together; invalid or missing files fail
startup explicitly. With neither variable configured the server uses HTTP for
deployments behind a TLS proxy, which must preserve the public Host header.
Login/logout origin checks expect HTTPS on that host and do not trust
client-supplied forwarded headers. Cookie flags remain unchanged in every mode.
Registration redirects to login; successful login redirects to `/products`.
Forms display API validation errors without redisplaying passwords.
The login page links to `/forgot-password` beneath the sign-up prompt.
Password reset uses backend `POST /forgot-password` (`email`) and
`POST /reset-password` (`token`, `password`). A successful reset returns to login.
For local development, enable `PASSWORD_RESET_DELIVERY=console` and set
`FRONTEND_BASE_URL=https://localhost:3000` in the backend `.env`, then apply its
latest migration. Request a reset and open the link printed in the backend
console. Tokens expire after 15 minutes and can only be used once. Email delivery
and profile-page password changes are not implemented yet.
The catalogue loads stored products from the backend, with search and category
filtering. An empty database displays an empty catalogue. Product prices are
returned in pence and formatted as GBP, and `imageURL` supports HTTP(S) images.
Select a product to open `/products/:prodId`, which renders the expanded product
page using `GET /products/:prodId` on the backend. Product IDs must be positive
safe integers. Invalid IDs return 400, missing products return 404, and backend
failures display an unavailable message with status 503.

API calls run on the frontend server, not in the browser, so CORS is not needed.
Backend requests time out after five seconds and show an unavailable message.
Customer login is at `/login`, staff login at `/admin/login`. The frontend
stores access and refresh credentials in Secure, HttpOnly, SameSite=Strict
cookies, preserves refresh expiry, and sends access tokens to the backend in
the Authorization header. Protected pages restore expired access credentials
through backend `POST /auth/refresh`, with one retry. A reload/browser restart
can restore the session until its absolute seven-day expiry. Stable backend
secrets and the refresh-session database migration are required.
`POST /logout` revokes the refresh session and expires both cookies.
Access tokens already issued may remain valid for their remaining 15 minutes.
Customer and staff login share cookie names, so they replace one another.
Basket persistence and staff dashboard metrics still require backend functionality;
the profile shows identity, but order history remains explicitly unavailable.

Admin user management (`/admin/users`, `/admin/users/:id`) forwards the staff
`Authorization`/`Cookie` headers to backend `GET /admin/users?search=&page=`
(`{ users, pagination? }`), `GET /admin/users/:id`
(`{ user, recentOrders, basket }`), and `POST /admin/users/:id/suspend` or
`/reactivate`. These backend endpoints are not implemented yet; see
`src/models/adminUser.ts` for the expected shapes.
When deployed behind a TLS-terminating reverse proxy, set `TRUSTED_PROXY` to
the proxy's IP address or CIDR (comma-separated for multiple proxies) so HTTPS
origin checks use the forwarded protocol. Only trust the actual proxy addresses
and prevent untrusted clients from connecting directly to the frontend.

Admin basket viewing (`/admin/baskets`, `/admin/baskets/:id`) forwards the same
staff headers to backend `GET /admin/baskets` (`{ baskets }`) and
`GET /admin/baskets/:id` (`{ basket }`). Basket search is filtered on the
frontend by basket ID, customer name or email. These backend endpoints are not
implemented yet; see `src/models/adminBasket.ts` for the expected shapes.

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
