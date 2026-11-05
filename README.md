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
Only the newest requested link works. A successful reset updates the stored
password and revokes the customer's existing refresh sessions; access tokens
already issued can remain valid until their 15-minute expiry. Console delivery
is rejected in production, and requests fail explicitly if delivery is disabled.
The catalogue loads stored products from the backend, with search and category
filtering. An empty database displays an empty catalogue. Product prices are
returned by the backend in pounds (e.g. `349.99`) and formatted as GBP without
conversion, and `imageURL` supports HTTP(S) images. Catalogue cards show a
shortened description; the full text is on the product page.
Select a product to open `/products/:productId`, which renders the expanded
product page using `GET /products/:productId` on the backend, including stock
from `inventory.quantity`. Product IDs must be positive safe integers. Invalid
IDs return 400, missing products return 404, and backend failures display an
unavailable message with status 503.

The product page's Add to basket form posts `productId` and `quantity` (1–99,
capped by stock) to the frontend's `POST /basket`, which forwards them as JSON to
the backend's `POST /basket`, relays the `basketId` cookie, and redirects to
`/basket`. Errors return to the product page with a message.

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
`/reactivate`. Admin and SuperAdmin can also permanently delete customers from
either user-management page after expanding "Delete permanently" and checking
the confirmation box. The frontend posts to backend
`POST /admin/users/:id/delete`; the backend atomically deletes the customer,
orders and order items, payment details, basket/items and customer refresh
sessions. This cannot be undone. Other staff roles cannot delete customers.
See `src/models/adminUser.ts` for the user response shapes.
Unimplemented staff-account and permission-management controls are not shown.
Staff login uses an email address, not a separate username; incorrect credentials
keep the staff login form visible with HTTP 401 and an accessible
"Invalid email or password" error, without redisplaying the password.
When deployed behind a TLS-terminating reverse proxy, set `TRUSTED_PROXY` to
the proxy's IP address or CIDR (comma-separated for multiple proxies) so HTTPS
origin checks use the forwarded protocol. Only trust the actual proxy addresses
and prevent untrusted clients from connecting directly to the frontend.

FinanceManager staff use the same `/admin` page with a read-only finance
dashboard: all-time revenue, total orders and pending orders. Revenue excludes
cancelled orders and does not represent confirmed payments. Its menu provides
dashboard navigation and logout, but no operational quick actions or
customer/inventory panels. Other roles retain
their existing dashboard. Direct resource URLs still use the backend permission
matrix; the finance-only dashboard does not expose operational navigation.

Staff sections are accessed through the top navigation and its matching menu,
not dashboard quick-action buttons. Users, Baskets, Orders and Inventory links
only appear when granted by the backend's role-scoped sections. Users and Baskets
open their existing pages. Orders (`/admin/orders`, including detail and mutation
URLs) intentionally return the standard 404 until that feature is enabled.
Inventory (`/admin/inventory`) opens the integrated inventory section.
Finance navigation remains dashboard-only.

### Admin inventory (KAN-71)

Inventory reuses KAN-97's backend-derived access context/session service and
KAN-104's admin navigation, icons, cards, tables, buttons, dialogs, loading states,
alerts and access-denied page. Inventory permissions come from the dashboard's
`inventoryPermissions`; missing permissions fail closed. No frontend role matrix
is introduced. The backend must include the KAN-71 API changes and database
migration; do not point the running app at an empty test database to preview
existing customer/product data.

The dashboard adds a clickable Inventory Management card with Total Products,
Low Stock Products and Out Of Stock Products. The inventory page supports
server-side name/SKU search, status filtering, sorting and pagination. Staff with
the corresponding backend permissions can create products, edit metadata/stock/
threshold/image, adjust stock with a reason, and delete after a cancel-first
confirmation dialog. Product details display paginated staff adjustment history
with UTC dates, actor, reason, adjustment, previous stock and new stock.

Create includes a supplier selector because the existing stock model requires
supplier-backed inventory. Images accept HTTP(S) URLs and existing `/images/`
paths, not uploads. SKU cannot be edited. Reserved stock cannot be removed;
products referenced by orders, baskets or reservations cannot be deleted.
Validation errors retain entered values; backend conflicts and outages are
displayed explicitly. Writes require the existing same-origin check.

All API calls use the existing server-side HTTP/session utilities and
`/api/admin/inventory` endpoints. Create uses POST, edit PUT, stock/threshold
changes PATCH and deletion DELETE. Form routes are `/admin/inventory/new`,
`/admin/inventory/:id/edit` and `/admin/inventory/:id`; history is on the details page.

Integration notes: KAN-97 and KAN-104 were merged into this feature branch before
implementation. Their admin controller/service, session service and test
conflicts were resolved retaining the shared access context, refreshed-request
credentials and KAN-104 UI. The backend must retain KAN-104's `lowStock` response
alongside KAN-71's new inventory summary/permissions. The existing supplier-line
low-stock panel is separate from product-level status counts. Finance's
finance-only dashboard remains unchanged; permission-granted direct inventory
URLs are read-only for that role. Order routes remain deliberately unregistered.

Dashboard summary cards include a green role badge under "Your access"; its
glow is disabled for reduced-motion preferences. Staff whose backend-granted
sections include Inventory also see "Low in stock", showing up to five stock
lines at or below their individual reorder levels (including zero stock).
The list includes suppliers because a product can have multiple stock lines.
Roles without inventory access do not see this panel. Missing inventory data
is shown as unavailable, rather than as an empty list.

Admin basket viewing (`/admin/baskets`, `/admin/baskets/:id`) uses the same
staff session handling as user management (access-token cookie, automatic
refresh, admin-login redirects with `returnTo`, customers sent to `/products`)
and calls backend `GET /admin/baskets?search=` (`{ baskets }`) and
`GET /admin/baskets/:id` (`{ basket }`). The `q` search term (max 100
characters) is passed to the backend, which matches basket ID, customer name or
email. See `src/models/adminBasket.ts` for the response shapes.

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
