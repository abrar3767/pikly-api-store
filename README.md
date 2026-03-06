# Pikly Store API 🛒

A full-featured eCommerce REST API built with **NestJS + TypeScript**, backed by **MongoDB Atlas**, and deployed on **Railway**. Ships with 106 products across 16 categories, JWT authentication with token revocation, fuzzy search, cart, orders, wishlist, product comparison, and a full admin panel for managing products, categories, orders, users, coupons, and banners.

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env` in the project root and fill in the required values:
```
PORT=3000
NODE_ENV=development
JWT_SECRET=replace_with_a_long_random_string_at_least_64_characters
MONGODB_URI=your_mongodb_connection_string_here
```

The app will **refuse to start** if `MONGODB_URI` or `JWT_SECRET` are missing. To generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> If your network does not support `mongodb+srv://` URIs (SRV DNS issues), use the direct connection string format instead:
> `mongodb://user:pass@shard-00-00.example.net:27017,...?ssl=true&authSource=admin&retryWrites=true&w=majority`

### 3. Seed the database
Run this once to populate MongoDB with products, categories, coupons, and banners from the local `data/` JSON files:
```bash
npx ts-node scripts/seed-mongodb.ts
```
This is safe to re-run — it uses upsert so it will never duplicate documents.

### 4. Start dev server
```bash
npm run start:dev
```
API runs at: `http://localhost:3000/api`
Swagger docs: `http://localhost:3000/api/docs` *(development only — hidden in production)*

### 5. Deploy to Railway
Push to GitHub, connect the repo to Railway, and add all environment variables from your `.env` file in the Railway dashboard under **Variables**. Railway automatically runs `npm run build` and starts the server.

---

## 🔑 Authentication

Register or login to receive a JWT token, then pass it as a header on all protected requests:
```
Authorization: Bearer <token>
```

Tokens are valid for 7 days. On logout, the token is immediately revoked server-side via a blacklist — it cannot be reused even within its remaining validity window. Use `POST /api/auth/refresh-token` to exchange a recently-expired token (up to 30 days old) for a fresh one.

### Admin Access
All `/api/admin/*` endpoints require a JWT with `role: "admin"`. To promote a user to admin, register normally via `POST /api/auth/register`, then either open MongoDB Atlas and change the user's `role` field from `"customer"` to `"admin"`, or use `PATCH /api/admin/users/:id/role` if you already have an admin token. Log in again after the change to receive a fresh token with the updated role.

---

## 🔒 Authorization Model

Several endpoints changed in this version to enforce proper ownership — **userId is never accepted from the client on protected routes**. It is always derived from the verified JWT token server-side.

| Area | Behavior |
|---|---|
| Orders | All order endpoints require auth. Users can only read and cancel their own orders. |
| Wishlist | All wishlist endpoints require auth. Users can only access their own wishlist. |
| Recently Viewed | All recently-viewed endpoints require auth. |
| Cart Merge | `POST /api/cart/merge` requires auth. The userId to merge into comes from the JWT, not the request body. |
| Logout | `POST /api/auth/logout` requires auth so the server knows which token to revoke. |

---

## 📋 API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | — | Register new account |
| POST | /api/auth/login | — | Login → returns JWT |
| POST | /api/auth/logout | ✅ JWT | Logout and revoke token |
| POST | /api/auth/refresh-token | — | Exchange expired token for new one |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/users/profile | ✅ JWT | Get my profile |
| PATCH | /api/users/profile | ✅ JWT | Update profile |
| GET | /api/users/addresses | ✅ JWT | Get my addresses |
| POST | /api/users/addresses | ✅ JWT | Add address |
| PATCH | /api/users/addresses/:id | ✅ JWT | Update address |
| DELETE | /api/users/addresses/:id | ✅ JWT | Delete address |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/products | — | Filter, search, sort, paginate + facets |
| GET | /api/products/featured | — | Featured products |
| GET | /api/products/bestsellers | — | Best sellers |
| GET | /api/products/new-arrivals | — | New arrivals |
| GET | /api/products/trending | — | Trending products |
| GET | /api/products/top-rated | — | Top rated products |
| GET | /api/products/on-sale | — | Products on sale |
| GET | /api/products/search/suggestions?q= | — | Autocomplete suggestions |
| GET | /api/products/:slug | — | Single product with related items |
| GET | /api/products/:slug/reviews | — | Product reviews with pagination |

### Categories
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/categories | — | Full hierarchical tree |
| GET | /api/categories/featured | — | Featured categories |
| GET | /api/categories/:slug | — | Single category with children |
| GET | /api/categories/:slug/products | — | Products filtered by category |

### Cart
Cart operations are session-based and do not require auth, with one exception: the merge endpoint requires a valid JWT so the server can determine which user account to merge into.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/cart?sessionId= | — | Get cart |
| POST | /api/cart/add | — | Add item |
| PATCH | /api/cart/update | — | Update quantity |
| DELETE | /api/cart/remove | — | Remove item |
| POST | /api/cart/apply-coupon | — | Apply coupon code |
| DELETE | /api/cart/remove-coupon?sessionId= | — | Remove coupon |
| POST | /api/cart/merge | ✅ JWT | Merge guest cart into user cart after login |
| GET | /api/cart/summary?sessionId= | — | Lightweight cart summary |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/orders/create | ✅ JWT | Create order from cart |
| GET | /api/orders | ✅ JWT | Get my orders |
| GET | /api/orders/:orderId | ✅ JWT | Single order detail (own orders only) |
| PATCH | /api/orders/:orderId/cancel | ✅ JWT | Cancel order (own orders only) |
| GET | /api/orders/:orderId/track | ✅ JWT | Track order with timeline (own orders only) |

### Wishlist
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/wishlist | ✅ JWT | Get my wishlist |
| POST | /api/wishlist/toggle | ✅ JWT | Add or remove a product |
| GET | /api/wishlist/check?productId= | ✅ JWT | Check if a product is in wishlist |

### Other
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/homepage | — | Full homepage data |
| GET | /api/homepage/banners?position= | — | Banners by position |
| GET | /api/images?page=&limit= | — | All product images paginated |
| POST | /api/compare | — | Compare 2–4 products |
| POST | /api/recently-viewed | ✅ JWT | Track a product view |
| GET | /api/recently-viewed | ✅ JWT | Get my recently viewed products |
| GET | /api/coupons/validate?code= | — | Validate a coupon code |
| GET | /api/health | — | Liveness check (public, minimal) |
| GET | /api/health/detail | ✅ Admin | Detailed health: heap, counts, uptime |

### Admin — Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/products | List all products with search and pagination |
| POST | /api/admin/products | Create a new product |
| PATCH | /api/admin/products/:id | Update product by id |
| PATCH | /api/admin/products/:id/toggle | Toggle active/inactive |
| DELETE | /api/admin/products/:id | Delete product permanently |

### Admin — Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/categories | List all categories (includes inactive) |
| POST | /api/admin/categories | Create a new category |
| PATCH | /api/admin/categories/:id | Update category |
| PATCH | /api/admin/categories/:id/toggle | Toggle active/inactive |
| DELETE | /api/admin/categories/:id | Delete category permanently |

### Admin — Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/orders | List all orders across all users |
| GET | /api/admin/orders/stats | Order counts grouped by status |
| GET | /api/admin/orders/:orderId | Single order detail |
| PATCH | /api/admin/orders/:orderId/status | Update order status |
| PATCH | /api/admin/orders/:orderId/tracking | Add tracking number |

### Admin — Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/users | List all users with search |
| GET | /api/admin/users/:id | Single user detail |
| PATCH | /api/admin/users/:id/ban | Ban user |
| PATCH | /api/admin/users/:id/unban | Unban user |
| PATCH | /api/admin/users/:id/role | Change user role |
| DELETE | /api/admin/users/:id | Delete user permanently |

### Admin — Coupons
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/coupons | List all coupons |
| POST | /api/admin/coupons | Create a new coupon |
| PATCH | /api/admin/coupons/:code | Update coupon |
| PATCH | /api/admin/coupons/:code/toggle | Toggle active/inactive |
| DELETE | /api/admin/coupons/:code | Delete coupon permanently |

### Admin — Banners
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/admin/banners | List all banners |
| POST | /api/admin/banners | Create a new banner |
| PATCH | /api/admin/banners/:id | Update banner |
| PATCH | /api/admin/banners/:id/toggle | Toggle active/inactive |
| DELETE | /api/admin/banners/:id | Delete banner permanently |

---

## 🔍 Filtering Products

```
GET /api/products?q=gaming&category=electronics&brand=ASUS,MSI&minPrice=500&maxPrice=1500&onSale=true&sort=price_asc&page=1&limit=20&includeFacets=true
```

Supported `sort` values: `relevance | price_asc | price_desc | rating_desc | newest | bestselling | discount_desc`

Pagination supports both offset mode (`page` + `limit`) and cursor mode (`cursor` + `limit`). Pass either `page` or `cursor` — not both.

---

## ⚠️ Breaking Changes from Previous Version

If you have an existing frontend or API client built against the previous version, these endpoints have changed their contract.

**Orders** — The `userId` query parameter on `GET /api/orders` has been removed. The user is now identified from the JWT token. All order endpoints now require `Authorization: Bearer <token>`.

**Wishlist** — The `userId` query parameter on `GET /api/wishlist` and `GET /api/wishlist/check` has been removed, and the `userId` field in the `POST /api/wishlist/toggle` body has been removed. All wishlist endpoints now require `Authorization: Bearer <token>`.

**Recently Viewed** — The `userId` query parameter on `GET /api/recently-viewed` and the `userId` field in the `POST /api/recently-viewed` body have been removed. Both endpoints now require `Authorization: Bearer <token>`.

**Cart Merge** — The `userId` field in the `POST /api/cart/merge` body has been removed. The userId is now taken from the JWT. This endpoint now requires `Authorization: Bearer <token>`.

**Logout** — `POST /api/auth/logout` now requires `Authorization: Bearer <token>` so the server can revoke the specific token. Calling it without a token returns 401.

**Health** — `GET /api/health` now returns only `{ status, timestamp }`. The detailed system information (heap, record counts, environment) has moved to `GET /api/health/detail` which requires an admin JWT.

---

## 📖 Swagger UI

Full interactive documentation with request/response schemas is available at `/api/docs`. This endpoint is only active when `NODE_ENV` is not set to `production`.