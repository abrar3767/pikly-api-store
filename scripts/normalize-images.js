/**
 * normalize-images.js
 *
 * All 106 products now have valid Unsplash photo IDs, but the 50 products that
 * were never broken still carry the original Unsplash API response URLs which
 * use `fit=max`. That parameter tells Unsplash to fit the image *within* the
 * requested dimensions without cropping — so a landscape photo comes back
 * as landscape, a portrait photo comes back as portrait. In a product grid
 * every card has the same width, so inconsistent heights make the grid look
 * broken.
 *
 * This script re-builds every product's media URLs using the same clean,
 * predictable format already used by the 56 fixed products:
 *   ?w=W&h=H&fit=crop&auto=format
 *
 * `fit=crop` tells Unsplash to fill the exact pixel box and centre-crop
 * whatever doesn't fit — every image comes back as a perfect square.
 *
 * Run once:
 *   node scripts/normalize-images.js
 *
 * Then re-seed:
 *   npx ts-node scripts/seed-mongodb.ts
 */

const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the bare photo ID (everything after "photo-" and before "?") */
function extractPhotoId(url) {
  const match = url && url.match(/photo-([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

/** Build all media size variants from a bare photo ID using consistent params */
function buildMedia(photoId) {
  const base = `https://images.unsplash.com/photo-${photoId}`
  return {
    thumb:   `${base}?w=200&h=200&fit=crop&auto=format`,
    small:   `${base}?w=400&h=400&fit=crop&auto=format`,
    regular: `${base}?w=1080&h=1080&fit=crop&auto=format`,
    full:    `${base}?w=2000&fit=crop&auto=format`,
    raw:     base,
    // Preserve htmlLink and download as-is — they are human-readable page
    // links, not image URLs, so they don't need normalization.
    htmlLink: null,   // filled in below from existing data
    download: null,   // filled in below from existing data
    video:          null,
    threeSixtyView: false,
  }
}

// ---------------------------------------------------------------------------
// Fix products.json
// ---------------------------------------------------------------------------
const productsPath = path.join(__dirname, '..', 'data', 'products.json')
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'))

let normalized = 0
let skipped = 0

for (const product of products) {
  const photoId = extractPhotoId(product.media?.thumb)

  if (!photoId) {
    console.warn(`⚠️  Could not extract photo ID for: ${product.id} (${product.imgKeyword})`)
    skipped++
    continue
  }

  const newMedia = buildMedia(photoId)

  // Preserve the htmlLink and download fields from the original where they
  // exist — they carry attribution info that is nice to keep.
  newMedia.htmlLink = product.media.htmlLink || newMedia.htmlLink
  newMedia.download = product.media.download || newMedia.download

  product.media = newMedia

  // Normalize variant images to the same square crop format
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      const varPhotoId = extractPhotoId(variant.image) || photoId
      variant.image = `https://images.unsplash.com/photo-${varPhotoId}?w=400&h=400&fit=crop&auto=format`
    }
  }

  normalized++
}

fs.writeFileSync(productsPath, JSON.stringify(products, null, 2))
console.log(`✅  products.json — ${normalized} products normalized, ${skipped} skipped`)

// ---------------------------------------------------------------------------
// Fix orders.json — order items carry a snapshot image URL too
// ---------------------------------------------------------------------------
const ordersPath = path.join(__dirname, '..', 'data', 'orders.json')
const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'))

// Build productId → normalized small image URL from the now-fixed products
const productImageMap = {}
for (const product of products) {
  if (product.id && product.media?.small) {
    productImageMap[product.id] = product.media.small
  }
}

let normalizedOrderItems = 0

for (const order of orders) {
  if (!Array.isArray(order.items)) continue
  for (const item of order.items) {
    const correctImage = productImageMap[item.productId]
    if (correctImage && item.image !== correctImage) {
      item.image = correctImage
      normalizedOrderItems++
    }
  }
}

fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2))
console.log(`✅  orders.json  — ${normalizedOrderItems} order item images normalized`)

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
const stillInconsistent = products.filter(p =>
  p.media?.thumb && !p.media.thumb.includes('fit=crop')
).length

console.log('')
if (stillInconsistent === 0) {
  console.log('✅  Verification passed — all product images now use fit=crop (uniform squares).')
  console.log('')
  console.log('Next step: re-seed your database.')
  console.log('  npx ts-node scripts/seed-mongodb.ts')
} else {
  console.log(`⚠️  ${stillInconsistent} products still do not use fit=crop. Check the warnings above.`)
}
