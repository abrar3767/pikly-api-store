# Pikly Store API 🛒

A full-featured eCommerce REST API built with **NestJS + TypeScript**, deployable to Vercel. 120+ products across 21 categories, JWT auth, fuzzy search, cart, orders, wishlist, compare and more.

---

## 🚀 Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Generate data (products, users, orders, coupons, banners)
```bash
ts-node scripts/generate-data.ts
```
> ⚠️ This calls the Unsplash API — takes ~2 minutes. Requires internet connection.

### 3. Start dev server
```bash
npm run start:dev
```
API runs at: `http://localhost:3000/api`  
Swagger docs: `http://localhost:3000/api/docs`

### 4. Deploy to Vercel (no git required)
```bash
npm run build
npx vercel deploy
```

---

## 📦 Environment Variables
Copy `.env.example` to `.env` and fill in values:
```
PORT=3000
JWT_SECRET=your_secret_here
UNSPLASH_ACCESS_KEY=your_key_here
```

---

## 📋 All Endpoints

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
| GET | /api/products/search/suggestions?q= | Autocomplete |
| GET | /api/products/:slug | Single product |
| GET | /api/products/:slug/reviews | Product reviews |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | Full hierarchical tree |
| GET | /api/categories/featured | Featured categories |
| GET | /api/categories/:slug | Single category |
| GET | /api/categories/:slug/products | Products in category |

### Cart
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cart?sessionId= | Get cart |
| POST | /api/cart/add | Add item |
| PATCH | /api/cart/update | Update quantity |
| DELETE | /api/cart/remove | Remove item |
| POST | /api/cart/apply-coupon | Apply coupon |
| DELETE | /api/cart/remove-coupon | Remove coupon |
| POST | /api/cart/merge | Merge guest → user cart |
| GET | /api/cart/summary?sessionId= | Cart summary |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/orders/create | Create order from cart |
| GET | /api/orders?userId= | User's orders |
| GET | /api/orders/:orderId | Single order |
| PATCH | /api/orders/:orderId/cancel | Cancel order |
| GET | /api/orders/:orderId/track | Track order |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login → JWT |
| POST | /api/auth/logout | Logout |
| POST | /api/auth/refresh-token | Refresh token |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/:userId/profile | Get profile |
| PATCH | /api/users/:userId/profile | Update profile |
| GET | /api/users/:userId/addresses | Get addresses |
| POST | /api/users/:userId/addresses | Add address |
| PATCH | /api/users/:userId/addresses/:id | Update address |
| DELETE | /api/users/:userId/addresses/:id | Delete address |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/homepage | Full homepage data |
| GET | /api/homepage/banners?position= | Banners |
| GET | /api/images?page=&limit= | All product images |
| POST | /api/compare | Compare 2-4 products |
| GET | /api/wishlist?userId= | Get wishlist |
| POST | /api/wishlist/toggle | Toggle wishlist item |
| GET | /api/wishlist/check | Check if in wishlist |
| POST | /api/recently-viewed | Track view |
| GET | /api/recently-viewed?userId= | Get recent |
| GET | /api/coupons/validate?code= | Validate coupon |
| GET | /api/health | Health check |

---

## 🔍 Filtering Products

```
GET /api/products?q=gaming&category=electronics&brand=ASUS,MSI&minPrice=500&maxPrice=1500&onSale=true&sort=price_asc&page=1&limit=20&includeFacets=true
```

**Sort options:** `relevance | price_asc | price_desc | rating_desc | newest | bestselling | discount_desc`

---

## 🔒 Auth

Login to get token, then pass as `Authorization: Bearer <token>` header.

---

## 📖 Swagger UI

Full interactive docs at `/api/docs`
