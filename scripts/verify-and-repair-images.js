/**
 * verify-and-repair-images.js
 *
 * This script does two things in one pass:
 *
 * 1. VERIFY — For every product, category, and user, it sends an HTTP HEAD
 *    request to the current image URL. A HEAD request fetches only the
 *    response headers (no body), so it is fast and bandwidth-free. If the
 *    server returns anything other than 2xx/3xx, the URL is considered broken.
 *
 * 2. REPAIR — For every broken URL it finds, it calls the Unsplash Search API
 *    using the item's keyword (product.imgKeyword, a category name, etc.) to
 *    fetch a fresh, API-confirmed photo. It then rebuilds all media size
 *    variants from the new photo ID and writes the fix back into the JSON file.
 *
 * After running this script, every image in your data files is backed by an
 * actual Unsplash API response — not a manually guessed ID.
 *
 * Usage:
 *   node scripts/verify-and-repair-images.js
 *
 * Requires UNSPLASH_ACCESS_KEY in your .env file.
 * Run from the project root (where package.json lives).
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const https = require('https')

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY
if (!UNSPLASH_KEY) {
  console.error('❌  UNSPLASH_ACCESS_KEY not found in .env')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpHead(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve(res.statusCode)
    })
    req.on('error', () => resolve(0))
    req.on('timeout', () => { req.destroy(); resolve(0) })
    req.end()
  })
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve(JSON.parse(body)))
    })
      .on('error', reject)
      .on('timeout', () => reject(new Error('timeout')))
  })
}

// ---------------------------------------------------------------------------
// Unsplash API helpers
// ---------------------------------------------------------------------------

// Rate limit: Unsplash allows 50 requests/hour on demo keys.
// We add a small delay between calls to avoid hitting it.
const DELAY_MS = 1200

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchUnsplashPhoto(keyword) {
  await delay(DELAY_MS)
  const url =
    `https://api.unsplash.com/search/photos` +
    `?query=${encodeURIComponent(keyword)}&per_page=1&orientation=squarish` +
    `&client_id=${UNSPLASH_KEY}`

  const data = await httpGet(url)

  if (!data.results || data.results.length === 0) {
    console.warn(`  ⚠️  No results for keyword "${keyword}", trying fallback "product"`)
    return fetchUnsplashPhoto('product')
  }

  const photo = data.results[0]
  return photo.id
}

function buildMedia(photoId, htmlLink = null, download = null) {
  const base = `https://images.unsplash.com/photo-${photoId}`
  return {
    thumb:   `${base}?w=200&h=200&fit=crop&auto=format`,
    small:   `${base}?w=400&h=400&fit=crop&auto=format`,
    regular: `${base}?w=1080&h=1080&fit=crop&auto=format`,
    full:    `${base}?w=2000&fit=crop&auto=format`,
    raw:     base,
    htmlLink:      htmlLink || `https://unsplash.com/photos/${photoId}`,
    download:      download || `https://unsplash.com/photos/${photoId}/download`,
    video:         null,
    threeSixtyView: false,
  }
}

// ---------------------------------------------------------------------------
// Check if a URL is alive
// ---------------------------------------------------------------------------

async function isAlive(url) {
  const status = await httpHead(url)
  return status >= 200 && status < 400
}

// ---------------------------------------------------------------------------
// Fix products
// ---------------------------------------------------------------------------

async function fixProducts(products) {
  let fixed = 0

  for (const product of products) {
    const thumbUrl = product.media?.thumb
    if (!thumbUrl) continue

    const ok = await isAlive(thumbUrl)
    if (ok) continue

    console.log(`  🔴 Broken: ${product.id} (${product.imgKeyword}) — ${thumbUrl.substring(0, 70)}`)

    try {
      const newPhotoId = await fetchUnsplashPhoto(product.imgKeyword || product.title)
      const newMedia = buildMedia(newPhotoId, product.media.htmlLink, product.media.download)
      product.media = newMedia

      if (Array.isArray(product.variants)) {
        product.variants.forEach((v) => {
          v.image = `https://images.unsplash.com/photo-${newPhotoId}?w=400&h=400&fit=crop&auto=format`
        })
      }

      console.log(`  ✅ Fixed:  ${product.id} → photo-${newPhotoId}`)
      fixed++
    } catch (err) {
      console.error(`  ❌ Could not fix ${product.id}: ${err.message}`)
    }
  }

  return fixed
}

// ---------------------------------------------------------------------------
// Fix orders — rebuild item images from product map
// ---------------------------------------------------------------------------

function fixOrders(orders, products) {
  const imgMap = {}
  products.forEach((p) => { if (p.id && p.media?.small) imgMap[p.id] = p.media.small })

  let fixed = 0
  orders.forEach((o) => {
    ;(o.items || []).forEach((item) => {
      const correct = imgMap[item.productId]
      if (correct && item.image !== correct) {
        item.image = correct
        fixed++
      }
    })
  })
  return fixed
}

// ---------------------------------------------------------------------------
// Fix categories
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS = {
  cat_001: 'electronics technology',
  cat_002: 'laptop computer',
  cat_003: 'gaming laptop',
  cat_004: 'ultrabook slim laptop',
  cat_005: 'smartphone mobile',
  cat_006: 'android smartphone',
  cat_007: 'iphone apple',
  cat_008: 'headphones audio',
  cat_009: 'fashion clothing',
  cat_010: 'mens fashion shirt',
  cat_011: 'shoes footwear',
  cat_012: 'home kitchen appliance',
  cat_013: 'beauty skincare',
  cat_014: 'sports fitness gym',
  cat_015: 'books reading',
  cat_016: 'accessories bags',
}

async function fixCategories(categories) {
  let fixed = 0
  for (const cat of categories) {
    const ok = await isAlive(cat.image)
    if (ok) continue

    console.log(`  🔴 Broken category: ${cat.id} (${cat.name})`)
    const keyword = CATEGORY_KEYWORDS[cat.id] || cat.name
    try {
      const newPhotoId = await fetchUnsplashPhoto(keyword)
      cat.image = `https://images.unsplash.com/photo-${newPhotoId}?w=400&h=400&fit=crop&auto=format`
      console.log(`  ✅ Fixed:  ${cat.id} → photo-${newPhotoId}`)
      fixed++
    } catch (err) {
      console.error(`  ❌ Could not fix ${cat.id}: ${err.message}`)
    }
  }
  return fixed
}

// ---------------------------------------------------------------------------
// Fix users
// ---------------------------------------------------------------------------

const USER_KEYWORDS = [
  'professional man portrait',
  'professional woman portrait',
  'business man headshot',
  'business woman headshot',
  'young man portrait',
  'young woman portrait',
  'person face portrait',
  'woman smiling portrait',
  'man smiling portrait',
  'professional headshot',
]

async function fixUsers(users) {
  let fixed = 0
  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    if (!user.avatar) continue

    const ok = await isAlive(user.avatar)
    if (ok) continue

    console.log(`  🔴 Broken user avatar: ${user.id} (${user.firstName})`)
    const keyword = USER_KEYWORDS[i % USER_KEYWORDS.length]
    try {
      const newPhotoId = await fetchUnsplashPhoto(keyword)
      user.avatar = `https://images.unsplash.com/photo-${newPhotoId}?w=200&h=200&fit=crop&auto=format`
      console.log(`  ✅ Fixed:  ${user.id} → photo-${newPhotoId}`)
      fixed++
    } catch (err) {
      console.error(`  ❌ Could not fix ${user.id}: ${err.message}`)
    }
  }
  return fixed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

;(async () => {
  const dataDir = path.join(__dirname, '..', 'data')

  const productsPath   = path.join(dataDir, 'products.json')
  const ordersPath     = path.join(dataDir, 'orders.json')
  const categoriesPath = path.join(dataDir, 'categories.json')
  const usersPath      = path.join(dataDir, 'users.json')

  const products   = JSON.parse(fs.readFileSync(productsPath, 'utf8'))
  const orders     = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))
  const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf8'))
  const users      = JSON.parse(fs.readFileSync(usersPath, 'utf8'))

  console.log('\n📦  Checking products...')
  const productFixed = await fixProducts(products)
  console.log(`    ${productFixed} products repaired\n`)

  console.log('🗂️   Checking categories...')
  const catFixed = await fixCategories(categories)
  console.log(`    ${catFixed} categories repaired\n`)

  console.log('👤  Checking users...')
  const userFixed = await fixUsers(users)
  console.log(`    ${userFixed} users repaired\n`)

  // Rebuild order images from the now-fixed product data
  const orderFixed = fixOrders(orders, products)
  console.log(`📋  Orders: ${orderFixed} item images synced\n`)

  // Write all files back
  fs.writeFileSync(productsPath,   JSON.stringify(products,   null, 2))
  fs.writeFileSync(ordersPath,     JSON.stringify(orders,     null, 2))
  fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2))
  fs.writeFileSync(usersPath,      JSON.stringify(users,      null, 2))

  const total = productFixed + catFixed + userFixed + orderFixed
  if (total === 0) {
    console.log('✅  All images are healthy — nothing needed repair.')
  } else {
    console.log(`✅  Done. Total repairs: ${total}`)
    console.log('    Re-seed your database:')
    console.log('    npx ts-node scripts/seed-mongodb.ts\n')
  }
})()