# Pikly Store API 🛒

A full-featured eCommerce REST API built with **NestJS + TypeScript**, backed by **MongoDB Atlas**, and deployed on **Railway**. Ships with 106 products across 16 categories, JWT authentication, fuzzy search, cart, orders, wishlist, product comparison, and a full admin panel for managing products, categories, orders, users, coupons and banners.

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Create a `.env` file in the project root:
```
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_here
MONGODB_URI=your_mongodb_connection_string_here
UNSPLASH_ACCESS_KEY=your_unsplash_key_here
```

> If your network does not support `mongodb+srv://` URIs (SRV DNS issues), use the standard connection string format instead:
> `mongodb://user:pass@shard-00-00.example.net:27017,shard-00-01.example.net:27017,shard-00-02.example.net:27017/pikly-store?ssl=true&authSource=admin&retryWrites=true&w=majority`

### 3. Seed the database
Run this once to populate MongoDB with products, categories, coupons and banners from the local `data/` JSON files:
```bash
npx ts-node scripts/seed-mongodb.ts
```
This is safe to re-run at any time — it uses upsert so it will never duplicate documents.

### 4. Start dev server
```bash
npm run start:dev
```
API runs at: `http://localhost:3000/api`  
Swagger docs: `http://localhost:3000/api/docs`

### 5. Deploy to Railway
Push to GitHub, then connect the repository to Railway. Add all environment variables from your `.env` file in the Railway dashboard under **Variables**. Railway automatically runs `npm run build` and starts the server.

---

## 🔑 Admin Access

All `/api/admin/*` endpoints require a valid JWT token with `role: "admin"`. To promote a user to admin, register normally via `POST /api/auth/register`, then open MongoDB Atlas, find the user document in the `users` collection, and change `role: "customer"` to `role: "admin"`. Log in again to receive a fresh token with the updated role. Alternatively, use the `PATCH /api/admin/users/:id/role` endpoint if you already have an admin token.

---

## 📋 API Endpoints

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | Filter, search, sort, paginate + facets |
| GET | /api/products/featured | Featured products |
| GET | /api/products/bestsellers | Best sellers |
| GET | /api/products/new-arrivals | New arrivals |
| GET | /api/products/trending | Trending |
| GET | /api/products/top-rated | Top rated |
| GET | /api/products/on-sale | On sale |
| GET | /api/products/search/suggestions?q= | Autocomplete suggestions |
| GET | /api/products/:slug | Single product with related items |
| GET | /api/products/:slug/reviews | Product reviews with pagination |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | Full hierarchical tree |
| GET | /api/categories/featured | Featured categories |
| GET | /api/categories/:slug | Single category with children |
| GET | /api/categories/:slug/products | Products filtered by category |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cart?sessionId= | Get cart |
| POST | /api/cart/add | Add item |
| PATCH | /api/cart/update | Update quantity |
| DELETE | /api/cart/remove | Remove item |
| POST | /api/cart/apply-coupon | Apply coupon code |
| DELETE | /api/cart/remove-coupon | Remove coupon |
| POST | /api/cart/merge | Merge guest cart into user cart after login |
| GET | /api/cart/summary?sessionId= | Lightweight cart summary |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/orders/create | Create order from cart |
| GET | /api/orders?userId= | Get user's orders |
| GET | /api/orders/:orderId | Single order detail |
| PATCH | /api/orders/:orderId/cancel | Cancel order |
| GET | /api/orders/:orderId/track | Track order with timeline |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new account |
| POST | /api/auth/login | Login → returns JWT |
| POST | /api/auth/logout | Logout |
| POST | /api/auth/refresh-token | Refresh expired token |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/profile | Get my profile |
| PATCH | /api/users/profile | Update profile |
| GET | /api/users/addresses | Get my addresses |
| POST | /api/users/addresses | Add address |
| PATCH | /api/users/addresses/:id | Update address |
| DELETE | /api/users/addresses/:id | Delete address |

### Wishlist
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/wishlist?userId= | Get wishlist |
| POST | /api/wishlist/toggle | Add or remove product |
| GET | /api/wishlist/check?userId=&productId= | Check if product is in wishlist |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/homepage | Full homepage data |
| GET | /api/homepage/banners?position= | Banners by position |
| GET | /api/images?page=&limit= | All product images paginated |
| POST | /api/compare | Compare 2–4 products |
| POST | /api/recently-viewed | Track a product view |
| GET | /api/recently-viewed?userId= | Get recently viewed products |
| GET | /api/coupons/validate?code= | Validate a coupon code |
| GET | /api/health | Health check with data stats |

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

Supported sort values: `relevance | price_asc | price_desc | rating_desc | newest | bestselling | discount_desc`

---

## 🔒 Authentication

Register or login to receive a JWT token, then pass it as a header on protected requests:
```
Authorization: Bearer <token>
```
Admin endpoints additionally require `role: "admin"` to be present in the token payload. A valid token with a customer role will receive a 403 Forbidden response from admin routes.

---

## 📖 Swagger UI

Full interactive documentation with request/response schemas is available at `/api/docs` when the server is running.