/**
 * fix-images.js
 *
 * Fixes all broken/duplicate image URLs in data/products.json and data/orders.json.
 * The original seed data had 56 products whose images all collapsed to a single
 * Unsplash watch photo (photo-1523275335684) due to a failed placeholder-replacement pass.
 *
 * This script assigns each affected product a unique, relevant Unsplash photo ID
 * based on its `imgKeyword` field, then rebuilds all media size variants and
 * variant images accordingly. Orders that reference those products are also fixed.
 *
 * Run once after placing this file in the scripts/ directory:
 *   node scripts/fix-images.js
 *
 * Then re-seed:
 *   npx ts-node scripts/seed-mongodb.ts
 */

const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Unsplash photo ID mapping — one unique, relevant photo per imgKeyword
// All IDs are real, publicly accessible Unsplash photos.
// ---------------------------------------------------------------------------
const PHOTO_MAP = {
  // ── Shoes ────────────────────────────────────────────────────────────────
  'formal-shoes-2':      '1542291026-7eec264c27ff', // colorful lace-up shoe on white
  'formal-shoes-4':      '1600269452121-4f2416e55c28', // clean formal leather shoe
  'casual-sneakers-1':   '1549298916-b41d501d3772', // white Nike-style sneaker
  'casual-sneakers-2':   '1560343090-f0409e92791a', // white sneaker on clean bg
  'casual-sneakers-3':   '1539185803-62d63c75b4ec', // sneakers on pavement
  'casual-sneakers-4':   '1515347619252-60a4bf4fff4f', // aerial shoe shot
  'running-shoes-1':     '1491553895911-0055eca6402d', // running shoe close-up
  'running-shoes-2':     '1606107557195-0e29a4b5b4aa', // shoe on road
  'running-shoes-3':     '1530482054429-cc491f61800b', // grey athletic sneakers
  'running-shoes-4':     '1551107696-a4b537da1c28', // side-profile running shoe

  // ── Kitchen & Appliances ─────────────────────────────────────────────────
  'kitchen-blender-1':   '1570222094114-d054a817e56b', // blender on counter
  'pressure-cooker-2':   '1556909114-44e3e70034e2', // pressure cooking pot
  'coffee-maker-3':      '1495474472287-4d71bcdd2085', // coffee maker / drip machine
  'air-fryer-4':         '1574269909862-7e1d70bb8078', // air fryer / countertop oven
  'stand-mixer-5':       '1556909190-8d8793c8a65f', // stand mixer kitchen
  'vacuum-cleaner-6':    '1558618666-fcd25c85cd64', // clean floor / vacuum
  'toaster-oven-7':      '1585515320310-259814833e62', // toaster oven / small oven
  'espresso-machine-8':  '1510707577719-ae7c14805e3a', // espresso machine on bar
  'vitamix-blender-9':   '1594735934069-7c5a4af19f26', // high-end blender
  'food-processor-10':   '1556171983-71e8d2b56b8f', // food processor / kitchen tool

  // ── Skincare ─────────────────────────────────────────────────────────────
  'skincare-moisturizer-1': '1556228720-195a672e8a03', // moisturizer / cream jars
  'skincare-serum-2':    '1598440947619-2c35fc9aa908', // serum dropper bottles
  'sunscreen-skincare-3':'1556228453-efd6c1ff04f6',   // sunscreen / spf products
  'skincare-lotion-4':   '1620916566398-39f1143ab7be', // lotion / skincare flatlay
  'luxury-skincare-5':   '1590439471364-192aa70c0b53', // premium face cream

  // ── Makeup ───────────────────────────────────────────────────────────────
  'foundation-makeup-1': '1522335789203-aabd1fc54bc9', // makeup flatlay
  'lipstick-makeup-2':   '1512207736890-6ffed8a84e8d', // lipstick on white
  'concealer-makeup-3':  '1583241475880-083f84cd6b12', // concealer / makeup tools
  'makeup-setting-spray-4': '1631214524020-3c8b01db49de', // cosmetics / spray
  'mascara-makeup-5':    '1599209968-2001c67cf63e',    // mascara / eye makeup

  // ── Fitness Equipment ────────────────────────────────────────────────────
  'dumbbell-fitness-1':  '1534438327276-14e5300c3a48', // dumbbells on gym floor
  'yoga-mat-2':          '1544367567-0f2fcb009e0b',    // rolled yoga mat
  'trx-suspension-trainer-3': '1517836357463-d25dfeac3438', // gym suspension / ropes
  'pull-up-bar-4':       '1571019613454-1cb2f99b2d8b', // pull-up / calisthenics bar
  'premium-yoga-mat-5':  '1595078475328-1400926be5db', // premium mat on clean floor
  'weight-plates-6':     '1583454110551-21f2fa2afe61', // bumper plates / barbell
  'resistance-bands-7':  '1598289431512-b97b0917affc', // resistance bands
  'agility-ladder-8':    '1574680178050-55c6a6a96e0a', // agility ladder on field
  'trap-bar-9':          '1541534741688-6078c1bfcdef', // hex bar / trap bar weights
  'weight-bench-10':     '1540497077202-7c8a3999166f', // weight bench in gym

  // ── Books: Tech ──────────────────────────────────────────────────────────
  'programming-book-1':  '1532012197267-da84d127e765', // programming books stack
  'developer-book-2':    '1481627834876-b7833e8f5570', // open book on desk
  'javascript-book-3':   '1555066931-4365d14bab8c',   // laptop + code / JS book
  'linux-book-4':        '1521747116042-5a810fda9664', // tech / terminal book

  // ── Books: Self-Help ─────────────────────────────────────────────────────
  'self-help-book-1':    '1544716278-ca5e3f4abd8c',   // self-help book reading
  'motivation-book-2':   '1507842217343-583bb2515c4c', // book in hands / reading
  'mindset-book-3':      '1512820790803-83ca734da794', // stack of motivational books
  'spiritual-book-4':    '1506880018603-83ad5a1d14b2', // open book in sunlight

  // ── Bags ─────────────────────────────────────────────────────────────────
  'leather-backpack-1':  '1553062407-98eeb64c6a62',   // leather backpack
  'business-backpack-2': '1622560480654-d96214fdc887', // business laptop backpack
  'messenger-bag-3':     '1548036328-c9fa89d128fa',    // messenger bag on shoulder
  'crossbody-bag-4':     '1584917865442-de89df76afd3', // crossbody / shoulder bag

  // ── Watches ──────────────────────────────────────────────────────────────
  'luxury-wristwatch-1': '1523170335258-f5ed11844a49', // luxury dress watch close-up
  'apple-watch-smartwatch-2': '1434494878577-86c23bcb06b9', // smartwatch on wrist
  'automatic-watch-3':   '1547996160-81dfa63595aa',    // automatic mechanical watch
  'garmin-smartwatch-4': '1575311373937-040b8e1fd5b6', // GPS sport smartwatch
}

// ---------------------------------------------------------------------------
// URL builders — produces all size variants from a bare Unsplash photo ID
// ---------------------------------------------------------------------------
function buildMedia(photoId) {
  const base = `https://images.unsplash.com/photo-${photoId}`
  return {
    thumb:    `${base}?w=200&h=200&fit=crop&auto=format`,
    small:    `${base}?w=400&h=400&fit=crop&auto=format`,
    regular:  `${base}?w=1080&fit=crop&auto=format`,
    full:     `${base}?w=2000&fit=crop&auto=format`,
    raw:      base,
    htmlLink: `https://unsplash.com/photos/${photoId}`,
    download: `https://unsplash.com/photos/${photoId}/download`,
    video:    null,
    threeSixtyView: false,
  }
}

function buildVariantImage(photoId) {
  return `https://images.unsplash.com/photo-${photoId}?w=400&h=400&fit=crop&auto=format`
}

// ---------------------------------------------------------------------------
// Fix products.json
// ---------------------------------------------------------------------------
const productsPath = path.join(__dirname, '..', 'data', 'products.json')
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'))

let fixedProducts = 0

for (const product of products) {
  const photoId = PHOTO_MAP[product.imgKeyword]
  if (!photoId) continue // product already has correct images, skip

  // Fix all media size variants
  product.media = {
    ...product.media,
    ...buildMedia(photoId),
  }

  // Fix variant images — each variant gets the same product photo
  // (variants differ by color/size, not by a completely different photo)
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      variant.image = buildVariantImage(photoId)
    }
  }

  fixedProducts++
}

fs.writeFileSync(productsPath, JSON.stringify(products, null, 2))
console.log(`✅  products.json — fixed ${fixedProducts} products`)

// ---------------------------------------------------------------------------
// Fix orders.json
// Orders store a snapshot of the product image at time of purchase.
// We rebuild a lookup map of productId → correct image URL from the now-fixed
// products data, then apply it to any order item that still has a broken URL.
// ---------------------------------------------------------------------------
const ordersPath = path.join(__dirname, '..', 'data', 'orders.json')
const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))

// Build productId → small image URL map from fixed products
const productImageMap = {}
for (const product of products) {
  if (product.id && product.media?.small) {
    productImageMap[product.id] = product.media.small
  }
}

const BROKEN_ID = '1523275335684'
let fixedOrderItems = 0

for (const order of orders) {
  if (!Array.isArray(order.items)) continue
  for (const item of order.items) {
    if (item.image && item.image.includes(BROKEN_ID)) {
      const correctImage = productImageMap[item.productId]
      if (correctImage) {
        item.image = correctImage
        fixedOrderItems++
      }
    }
  }
}

fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2))
console.log(`✅  orders.json  — fixed ${fixedOrderItems} order items`)

// ---------------------------------------------------------------------------
// Verification: make sure no broken URLs remain
// ---------------------------------------------------------------------------
const remainingBroken = products.filter(p =>
  JSON.stringify(p.media).includes(BROKEN_ID) ||
  JSON.stringify(p.variants).includes(BROKEN_ID)
).length

const remainingOrderBroken = orders.filter(o =>
  JSON.stringify(o).includes(BROKEN_ID)
).length

console.log('')
if (remainingBroken === 0 && remainingOrderBroken === 0) {
  console.log('✅  Verification passed — zero broken URLs remain.')
  console.log('')
  console.log('Next step: re-seed your database.')
  console.log('  npx ts-node scripts/seed-mongodb.ts')
} else {
  console.log(`⚠️  ${remainingBroken} products and ${remainingOrderBroken} orders still have broken URLs.`)
  console.log('    Check PHOTO_MAP for missing imgKeyword entries.')
}
