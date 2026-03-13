import { faker } from '@faker-js/faker'
import * as fs from 'fs'
import * as path from 'path'
import slugify from 'slugify'

const KEY = '5aTONFX9_ovVuQYTeXwqPKFxPe1EFXU-jlzCkdPAljE'

// Unsplash direct image IDs (images.unsplash.com) — work without API for fallback
const UNSPLASH_IMAGE_IDS = [
  '1523275335684-37898b6baf30',
  '1505740420925-f5e8c1ef78d0',
  '1542291026-7eec264c27ff',
  '1526170375425-6d350f0d4fee',
  '1496181133206-3c38557e2fa4',
  '1572635198757-5cf81437daab',
  '1585386959984-a915522a31eb',
  '1546868871-7041f2a55e12',
  '1510557880182-3d4d3c35b5b3',
  '1606107557195-0e29a4b5b4aa',
]

function unsplashUrl(id: string, w: number, h: number = w): string {
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format`
}

function pickUnsplashId(keyword: string): string {
  let h = 0
  for (let i = 0; i < keyword.length; i++) h = (h << 5) - h + keyword.charCodeAt(i)
  const idx = Math.abs(h) % UNSPLASH_IMAGE_IDS.length
  return UNSPLASH_IMAGE_IDS[idx]
}

// ─── Unsplash image fetcher ───────────────────────────────────────────────────
async function fetchImage(keyword: string) {
  await new Promise(r => setTimeout(r, 600))
  const fallbackId = pickUnsplashId(keyword)
  const fallback = {
    thumb: unsplashUrl(fallbackId, 200),
    small: unsplashUrl(fallbackId, 400),
    regular: unsplashUrl(fallbackId, 1080),
    full: unsplashUrl(fallbackId, 2000),
    raw: unsplashUrl(fallbackId, 4000),
    htmlLink: 'https://unsplash.com',
    download: 'https://unsplash.com',
  }
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keyword)}&client_id=${KEY}`,
    )
    const data = await res.json()
    if (data.urls?.thumb && data.urls?.small) {
      return {
        thumb: data.urls.thumb,
        small: data.urls.small,
        regular: data.urls.regular ?? fallback.regular,
        full: data.urls.full ?? fallback.full,
        raw: data.urls.raw ?? fallback.raw,
        htmlLink: data.links?.html ?? 'https://unsplash.com',
        download: data.links?.download ?? 'https://unsplash.com',
      }
    }
  } catch {
    /* use fallback */
  }
  return fallback
}

// ─── Counter ──────────────────────────────────────────────────────────────────
let productIndex = 1
const pid = () => `prod_${String(productIndex++).padStart(4, '0')}`

// ─── Review generator ─────────────────────────────────────────────────────────
function makeReviews(productId: string, count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    reviewId:   `rev_${productId}_${String(i).padStart(2, '0')}`,
    userId:     `usr_${String(faker.number.int({ min: 1, max: 10 })).padStart(3, '0')}`,
    userName:   `${faker.person.firstName()} ${faker.person.lastName()[0]}.`,
    rating:     faker.number.int({ min: 3, max: 5 }),
    title:      faker.lorem.sentence({ min: 4, max: 8 }),
    body:       faker.lorem.sentences({ min: 2, max: 3 }),
    verified:   faker.datatype.boolean({ probability: 0.8 }),
    helpful:    faker.number.int({ min: 0, max: 120 }),
    notHelpful: faker.number.int({ min: 0, max: 10 }),
    images:     [],
    createdAt:  faker.date.between({ from: '2024-01-01', to: '2025-02-01' }).toISOString(),
  }))
}

// ─── Pricing generator ────────────────────────────────────────────────────────
function makePricing(original: number, discountPct: number) {
  const current = parseFloat((original * (1 - discountPct / 100)).toFixed(2))
  const months = ['2024-09','2024-10','2024-11','2024-12','2025-01','2025-02']
  let p = original
  const history = months.map(date => {
    p = parseFloat((p * faker.number.float({ min: 0.93, max: 1.0 })).toFixed(2))
    return { date, price: p }
  })
  return { original, current, discountPercent: discountPct, currency: 'USD', priceHistory: history }
}

// ─── Shipping generator ───────────────────────────────────────────────────────
function makeShipping(weightKg: string) {
  return {
    weight: weightKg,
    dimensions: {
      l: faker.number.int({ min: 10, max: 50 }),
      w: faker.number.int({ min: 10, max: 40 }),
      h: faker.number.int({ min: 2, max: 20 }),
      unit: 'cm',
    },
    freeShipping:      faker.datatype.boolean({ probability: 0.6 }),
    estimatedDays:     { min: faker.number.int({ min: 1, max: 3 }), max: faker.number.int({ min: 4, max: 7 }) },
    expressAvailable:  faker.datatype.boolean({ probability: 0.7 }),
  }
}

// ─── Ratings generator ───────────────────────────────────────────────────────
function makeRatings() {
  const count = faker.number.int({ min: 50, max: 2000 })
  const avg   = parseFloat(faker.number.float({ min: 3.5, max: 5.0 }).toFixed(1))
  const five  = Math.floor(count * 0.5)
  const four  = Math.floor(count * 0.25)
  const three = Math.floor(count * 0.13)
  const two   = Math.floor(count * 0.07)
  const one   = count - five - four - three - two
  return { average: avg, count, distribution: { '5': five, '4': four, '3': three, '2': two, '1': one } }
}

// ─── Flags generator ─────────────────────────────────────────────────────────
function makeFlags() {
  return {
    featured:   faker.datatype.boolean({ probability: 0.3 }),
    bestSeller: faker.datatype.boolean({ probability: 0.25 }),
    newArrival: faker.datatype.boolean({ probability: 0.3 }),
    trending:   faker.datatype.boolean({ probability: 0.35 }),
    topRated:   faker.datatype.boolean({ probability: 0.2 }),
    onSale:     faker.datatype.boolean({ probability: 0.4 }),
  }
}

// ─── PRODUCT GENERATORS PER CATEGORY ─────────────────────────────────────────

async function makeGamingLaptops() {
  const brands = ['ASUS ROG','MSI','Razer','Lenovo Legion','HP OMEN','Acer Predator']
  const gpus   = ['NVIDIA RTX 4060 8GB','NVIDIA RTX 4070 8GB','NVIDIA RTX 4080 12GB','NVIDIA RTX 3060 6GB']
  const cpus   = ['Intel Core i7-13700H','AMD Ryzen 7 7745HX','Intel Core i9-13900H','AMD Ryzen 9 7945HX']
  return Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const title = `${brand} Gaming Laptop ${faker.helpers.arrayElement(['Pro','Elite','Ultimate','X'])} ${2024 + faker.number.int({ min: 0, max: 1 })}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `gaming-laptop-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 899, max: 2499 })
    const disc     = faker.number.int({ min: 5, max: 30 })
    return {
      id, slug, title, brand,
      description: `The ${title} delivers exceptional gaming performance with ${faker.helpers.arrayElement(gpus)} graphics. Designed for serious gamers who demand the best frame rates and thermal performance in a portable form factor.`,
      category: 'electronics', subcategory: 'laptops', subSubcategory: 'gaming-laptops',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 5, max: 80 }), sold: faker.number.int({ min: 50, max: 600 }), reserved: faker.number.int({ min: 0, max: 10 }), warehouse: faker.helpers.arrayElement(['WH-East-01','WH-West-01','WH-Central-01']), restockDate: null },
      attributes: {
        ram:         faker.helpers.arrayElement(['8GB DDR5','16GB DDR5','32GB DDR5']),
        storage:     faker.helpers.arrayElement(['512GB NVMe SSD','1TB NVMe SSD','2TB NVMe SSD']),
        processor:   faker.helpers.arrayElement(cpus),
        gpu:         faker.helpers.arrayElement(gpus),
        screenSize:  faker.helpers.arrayElement(['15.6 inch','16 inch','17.3 inch']),
        resolution:  faker.helpers.arrayElement(['1920x1080 144Hz','2560x1440 165Hz','1920x1080 240Hz']),
        os:          faker.helpers.arrayElement(['Windows 11 Home','Windows 11 Pro']),
        weight:      faker.helpers.arrayElement(['2.1kg','2.3kg','2.5kg','2.8kg']),
        batteryLife: faker.helpers.arrayElement(['4 hrs','6 hrs','8 hrs']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: faker.helpers.arrayElement(['Eclipse Gray','Phantom Black','Stealth Black']), colorHex: '#2a2a2a', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price Online`, metaDescription: `Get the ${title} at the best price. High performance gaming laptop with latest GPU.`, keywords: ['gaming laptop', brand.toLowerCase(), 'rtx laptop'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping(`${faker.number.float({ min: 2.0, max: 3.0, fractionDigits: 1 })}kg`),
      tags: ['gaming', 'laptop', 'rtx', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }),
      isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeUltrabooks() {
  const brands = ['Apple','Dell XPS','Lenovo ThinkPad','HP Spectre','ASUS ZenBook']
  const cpus   = ['Intel Core Ultra 7 155H','Apple M3 Pro','Intel Core i7-1365U','AMD Ryzen 7 7730U']
  return Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const title = `${brand} Ultrabook ${faker.helpers.arrayElement(['14','13.6','15'])} inch ${faker.helpers.arrayElement(['OLED','Retina','IPS'])}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `ultrabook-laptop-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 999, max: 2999 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand,
      description: `The ${title} is a premium ultrabook built for professionals. Ultra-thin design with all-day battery life and stunning display make it perfect for productivity on the go.`,
      category: 'electronics', subcategory: 'laptops', subSubcategory: 'ultrabooks',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 5, max: 60 }), sold: faker.number.int({ min: 30, max: 400 }), reserved: faker.number.int({ min: 0, max: 8 }), warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        ram:         faker.helpers.arrayElement(['8GB','16GB','32GB']),
        storage:     faker.helpers.arrayElement(['256GB SSD','512GB SSD','1TB SSD']),
        processor:   faker.helpers.arrayElement(cpus),
        gpu:         faker.helpers.arrayElement(['Intel Iris Xe','Apple M3 GPU 18-core','AMD Radeon 780M']),
        screenSize:  faker.helpers.arrayElement(['13.6 inch','14 inch','15.6 inch']),
        resolution:  faker.helpers.arrayElement(['2560x1664 Retina','2880x1800 OLED','1920x1200 IPS']),
        os:          faker.helpers.arrayElement(['macOS Sonoma','Windows 11 Pro','Windows 11 Home']),
        weight:      faker.helpers.arrayElement(['1.2kg','1.4kg','1.6kg']),
        batteryLife: faker.helpers.arrayElement(['12 hrs','15 hrs','18 hrs','20 hrs']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: faker.helpers.arrayElement(['Space Gray','Silver','Midnight Blue','Platinum']), colorHex: '#c0c0c0', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 25 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — slim, powerful ultrabook for professionals.`, keywords: ['ultrabook', brand.toLowerCase(), 'thin laptop'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping(`${faker.number.float({ min: 1.2, max: 1.8, fractionDigits: 1 })}kg`),
      tags: ['ultrabook', 'laptop', 'thin', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }),
      isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeAndroidPhones() {
  const brands  = ['Samsung','Google','OnePlus','Xiaomi','Motorola','Sony','Realme','Nothing']
  const cpus    = ['Snapdragon 8 Gen 3','Dimensity 9300','Exynos 2400','Google Tensor G4']
  const cameras = ['50MP + 12MP + 10MP','200MP + 12MP','50MP + 50MP + 48MP','108MP + 12MP + 5MP']
  return Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const title = `${brand} ${faker.helpers.arrayElement(['Galaxy S24 Ultra','Pixel 9 Pro','12 Pro','14 Ultra','Edge 50'])} ${faker.helpers.arrayElement(['256GB','512GB','1TB'])}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `android-smartphone-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 299, max: 1299 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `The ${title} features a cutting-edge ${faker.helpers.arrayElement(cpus)} processor with ${faker.helpers.arrayElement(cameras)} camera system. Experience blazing-fast 5G connectivity and all-day battery life.`,
      category: 'electronics', subcategory: 'smartphones', subSubcategory: 'android',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 10, max: 150 }), sold: faker.number.int({ min: 100, max: 2000 }), reserved: faker.number.int({ min: 0, max: 20 }), warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        ram:       faker.helpers.arrayElement(['8GB','12GB','16GB']),
        storage:   faker.helpers.arrayElement(['128GB','256GB','512GB','1TB']),
        camera:    faker.helpers.arrayElement(cameras),
        battery:   faker.helpers.arrayElement(['4500mAh','5000mAh','5500mAh']),
        network:   '5G',
        display:   faker.helpers.arrayElement(['6.1 inch OLED','6.4 inch AMOLED','6.7 inch LTPO OLED','6.8 inch Dynamic AMOLED']),
        os:        faker.helpers.arrayElement(['Android 14','Android 15']),
        processor: faker.helpers.arrayElement(cpus),
      },
      variants: [
        { variantId: `var_${id}_a`, color: faker.helpers.arrayElement(['Phantom Black','Titanium Gray','Cream White','Cobalt Blue']), colorHex: faker.color.rgb(), size: null, image: media.small, stock: faker.number.int({ min: 10, max: 50 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: faker.helpers.arrayElement(['Forest Green','Lavender','Burgundy','Silver']), colorHex: faker.color.rgb(), size: null, image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 50 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} with 5G, ${faker.helpers.arrayElement(cameras)} camera. Best smartphone deal.`, keywords: ['android', 'smartphone', brand.toLowerCase(), '5g phone'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('195g'),
      tags: ['android', 'smartphone', '5g', brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }),
      isActive: true,
      createdAt: faker.date.between({ from: '2023-06-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeiPhones() {
  const models   = ['iPhone 16 Pro Max','iPhone 16 Pro','iPhone 16 Plus','iPhone 16']
  const storages = ['128GB','256GB','512GB','1TB']
  const colors   = [['Natural Titanium','#b5a48a'],['Black Titanium','#2d2d2d'],['White Titanium','#f5f0ea'],['Desert Titanium','#c9a96e']]
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const id      = pid()
    const storage = storages[i]
    const title   = `Apple ${models[i]} ${storage}`
    const slug    = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `iphone-${i + 1}`
    const media   = await fetchImage(keyword)
    const original = faker.number.int({ min: 799, max: 1599 })
    const disc     = faker.number.int({ min: 3, max: 12 })
    return {
      id, slug, title, brand: 'Apple',
      description: `The ${title} features Apple's most powerful A18 Pro chip with next-generation Neural Engine. The advanced camera system with 48MP Fusion, 12MP Ultra Wide, and 12MP 5x Telephoto delivers stunning photography.`,
      category: 'electronics', subcategory: 'smartphones', subSubcategory: 'iphone',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 10, max: 100 }), sold: faker.number.int({ min: 200, max: 3000 }), reserved: faker.number.int({ min: 0, max: 15 }), warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        ram:       '8GB',
        storage,
        camera:    '48MP Fusion + 12MP Ultra Wide + 12MP Telephoto',
        battery:   faker.helpers.arrayElement(['3274mAh','3582mAh','4422mAh']),
        network:   '5G',
        display:   faker.helpers.arrayElement(['6.1 inch Super Retina XDR','6.7 inch Super Retina XDR','6.3 inch ProMotion OLED']),
        os:        'iOS 18',
        processor: 'Apple A18 Pro',
      },
      variants: colors.slice(0, 2).map((c, j) => ({
        variantId: `var_${id}_${String.fromCharCode(97 + j)}`,
        color: c[0], colorHex: c[1], size: null,
        image: media.small,
        stock: faker.number.int({ min: 10, max: 40 }), priceDiff: j * 100,
      })),
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Official Apple Store Price`, metaDescription: `${title} — Apple A18 Pro chip, 48MP camera, 5G. Best iPhone deal online.`, keywords: ['iphone', 'apple', 'ios', models[i].toLowerCase()], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('227g'),
      tags: ['iphone', 'apple', 'ios', 'smartphone'],
      isFeatured: true, isActive: true,
      createdAt: faker.date.between({ from: '2024-09-01', to: '2024-11-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-11-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeHeadphones() {
  const brands = ['Sony','Bose','Apple','Sennheiser']
  const models = ['WH-1000XM6','QuietComfort 45','AirPods Max','Momentum 4 Wireless']
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const id    = pid()
    const title = `${brands[i]} ${models[i]}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `headphones-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 149, max: 549 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand: brands[i],
      description: `The ${title} delivers industry-leading noise cancellation with exceptional sound quality. Multipoint connection lets you switch between two devices seamlessly.`,
      category: 'electronics', subcategory: 'audio', subSubcategory: 'headphones',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 15, max: 120 }), sold: faker.number.int({ min: 80, max: 1500 }), reserved: 0, warehouse: 'WH-West-01', restockDate: null },
      attributes: {
        connectivity:      faker.helpers.arrayElement(['Bluetooth 5.3','Bluetooth 5.2 + USB-C']),
        type:              'Over-ear',
        noiseCancellation: 'Active ANC',
        batteryLife:       faker.helpers.arrayElement(['20 hrs','30 hrs','40 hrs']),
        driver:            faker.helpers.arrayElement(['30mm','40mm','45mm']),
        codec:             faker.helpers.arrayElement(['SBC, AAC, LDAC','SBC, AAC, aptX HD']),
        weight:            faker.helpers.arrayElement(['250g','300g','385g']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Midnight Black', colorHex: '#1a1a1a', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Platinum Silver', colorHex: '#c0c0c0', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 20 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} wireless headphones with ANC. Best sound quality.`, keywords: ['headphones', 'wireless', brands[i].toLowerCase(), 'anc'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('300g'),
      tags: ['headphones', 'wireless', 'anc', brands[i].toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.4 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeEarbuds() {
  const brands = ['Apple','Samsung','Sony','Jabra']
  const models = ['AirPods Pro 2nd Gen','Galaxy Buds 3 Pro','WF-1000XM5','Elite 10']
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const id    = pid()
    const title = `${brands[i]} ${models[i]}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `wireless-earbuds-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 99, max: 299 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand: brands[i],
      description: `${title} delivers premium sound with active noise cancellation in a truly wireless form. Comfortable fit and long battery life make them perfect for all-day use.`,
      category: 'electronics', subcategory: 'audio', subSubcategory: 'earbuds',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 200 }), sold: faker.number.int({ min: 200, max: 3000 }), reserved: 0, warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        connectivity:      'Bluetooth 5.3',
        type:              'In-ear',
        noiseCancellation: 'Active ANC',
        batteryLife:       faker.helpers.arrayElement(['6 hrs (30 hrs with case)','8 hrs (32 hrs with case)']),
        driver:            faker.helpers.arrayElement(['6mm','10mm dynamic','Balanced Armature']),
        codec:             faker.helpers.arrayElement(['AAC, SBC','LDAC, AAC, SBC','aptX HD']),
        weight:            faker.helpers.arrayElement(['5g','6g','7g']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'White', colorHex: '#f5f5f5', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 60 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Black', colorHex: '#1a1a1a', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Deal`, metaDescription: `${title} true wireless earbuds with ANC. Unmatched audio.`, keywords: ['earbuds', 'tws', brands[i].toLowerCase(), 'wireless'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('50g'),
      tags: ['earbuds', 'tws', 'wireless', brands[i].toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-06-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeSpeakers() {
  const items = [['JBL','Charge 6'],['Bose','SoundLink Max']]
  return Promise.all(items.map(async ([brand, model], i) => {
    const id    = pid()
    const title = `${brand} ${model} Portable Bluetooth Speaker`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `bluetooth-speaker-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 99, max: 399 })
    const disc     = faker.number.int({ min: 5, max: 15 })
    return {
      id, slug, title, brand,
      description: `The ${title} delivers powerful 360-degree sound in a rugged, waterproof design. Perfect for outdoor adventures or home listening sessions.`,
      category: 'electronics', subcategory: 'audio', subSubcategory: 'speakers',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 150 }), sold: faker.number.int({ min: 100, max: 2000 }), reserved: 0, warehouse: 'WH-West-01', restockDate: null },
      attributes: {
        connectivity:    'Bluetooth 5.3 + USB-C + AUX',
        batteryLife:     faker.helpers.arrayElement(['12 hrs','20 hrs','24 hrs']),
        waterResistance: faker.helpers.arrayElement(['IP67','IPX7','IP68']),
        power:           faker.helpers.arrayElement(['20W','30W','40W']),
        weight:          faker.helpers.arrayElement(['490g','900g','1.5kg']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#1a1a1a', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 50 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Blue', colorHex: '#0066cc', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — waterproof, powerful bass, long battery.`, keywords: ['speaker', 'bluetooth', brand.toLowerCase(), 'portable'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('900g'),
      tags: ['speaker', 'bluetooth', 'waterproof', brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeShirts() {
  const brands = ['Ralph Lauren','Calvin Klein','Tommy Hilfiger','Lacoste','Hugo Boss']
  const fabrics = ['100% Cotton','Linen Blend','Oxford Cotton','Poplin','Twill']
  const fits    = ['Slim Fit','Regular Fit','Relaxed Fit']
  return Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const style = faker.helpers.arrayElement(['Oxford','Classic','Striped','Checked','Plain'])
    const title = `${brand} ${style} ${faker.helpers.arrayElement(['Formal','Casual','Business'])} Shirt`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `dress-shirt-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 39, max: 149 })
    const disc     = faker.number.int({ min: 10, max: 40 })
    return {
      id, slug, title, brand,
      description: `The ${title} combines timeless style with premium ${faker.helpers.arrayElement(fabrics)} fabric. Perfect for office wear or smart-casual occasions.`,
      category: 'fashion', subcategory: 'mens-clothing', subSubcategory: 'shirts',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 200 }), sold: faker.number.int({ min: 50, max: 800 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        sizes:    ['XS','S','M','L','XL','XXL'],
        color:    faker.helpers.arrayElement(['White','Light Blue','Navy','Black','Gray','Pink']),
        fabric:   faker.helpers.arrayElement(fabrics),
        fit:      faker.helpers.arrayElement(fits),
        occasion: faker.helpers.arrayElement(['Formal','Business Casual','Smart Casual']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'White', colorHex: '#ffffff', size: 'M', image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Navy', colorHex: '#003366', size: 'M', image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} in premium fabric. Perfect for any occasion.`, keywords: ['shirt', 'mens shirt', brand.toLowerCase(), 'formal'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('300g'),
      tags: ['shirt', 'mens', 'fashion', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.2 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makePants() {
  const brands = ['Levi\'s','Dockers','H&M','Zara','Gap']
  return Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const style = faker.helpers.arrayElement(['Slim Fit Chino','Classic Jeans','Cargo','Formal Trousers','Jogger'])
    const title = `${brand} ${style} Pants`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `mens-trousers-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 29, max: 99 })
    const disc     = faker.number.int({ min: 10, max: 35 })
    return {
      id, slug, title, brand,
      description: `The ${title} offers superior comfort and style. Made from premium fabric with a modern cut designed for the contemporary man.`,
      category: 'fashion', subcategory: 'mens-clothing', subSubcategory: 'pants',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 150 }), sold: faker.number.int({ min: 40, max: 600 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        sizes:    ['28','30','32','34','36','38'],
        color:    faker.helpers.arrayElement(['Black','Navy','Khaki','Gray','Olive']),
        fabric:   faker.helpers.arrayElement(['98% Cotton 2% Elastane','100% Cotton','Polyester Blend']),
        fit:      faker.helpers.arrayElement(['Slim Fit','Regular Fit','Straight Fit','Relaxed Fit']),
        occasion: faker.helpers.arrayElement(['Casual','Formal','Smart Casual','Outdoor']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#000000', size: '32', image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Navy', colorHex: '#001f5b', size: '32', image: media.small, stock: faker.number.int({ min: 5, max: 25 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — premium fabric, modern fit.`, keywords: ['pants', 'mens pants', brand.toLowerCase(), 'trousers'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('450g'),
      tags: ['pants', 'mens', 'fashion', brand.toLowerCase().replace("'", '')],
      isFeatured: faker.datatype.boolean({ probability: 0.2 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeJackets() {
  const brands = ['North Face','Columbia','Levi\'s','Zara','Massimo Dutti']
  return Promise.all(Array.from({ length: 5 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const style = faker.helpers.arrayElement(['Leather Biker','Puffer','Bomber','Trench Coat','Windbreaker'])
    const title = `${brand} ${style} Jacket`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `mens-jacket-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 59, max: 299 })
    const disc     = faker.number.int({ min: 10, max: 40 })
    return {
      id, slug, title, brand,
      description: `The ${title} is built for style and weather protection. Premium construction ensures durability while keeping you warm and fashionable.`,
      category: 'fashion', subcategory: 'mens-clothing', subSubcategory: 'jackets',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 15, max: 120 }), sold: faker.number.int({ min: 30, max: 500 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        sizes:    ['XS','S','M','L','XL','XXL'],
        color:    faker.helpers.arrayElement(['Black','Brown','Navy','Olive','Charcoal']),
        fabric:   faker.helpers.arrayElement(['Genuine Leather','Nylon Shell','Polyester Fill','Wool Blend']),
        fit:      faker.helpers.arrayElement(['Slim Fit','Regular Fit','Relaxed Fit']),
        occasion: faker.helpers.arrayElement(['Casual','Outdoor','Smart Casual','Winter']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#000000', size: 'M', image: media.small, stock: faker.number.int({ min: 8, max: 30 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Brown', colorHex: '#6b3a2a', size: 'M', image: media.small, stock: faker.number.int({ min: 5, max: 20 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — premium quality, stylish design.`, keywords: ['jacket', 'mens jacket', brand.toLowerCase(), style.toLowerCase()], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('800g'),
      tags: ['jacket', 'mens', 'outerwear', brand.toLowerCase().replace("'", '')],
      isFeatured: faker.datatype.boolean({ probability: 0.25 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeFormalShoes() {
  const brands = ['Clarks','Ecco','Cole Haan','Steve Madden']
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const style = faker.helpers.arrayElement(['Oxford','Derby','Brogue','Loafer'])
    const title = `${brand} ${style} Formal Leather Shoes`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `formal-shoes-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 79, max: 249 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `Handcrafted ${title} made from full-grain leather with a cushioned insole for all-day comfort. Perfect for business meetings, weddings, and formal events.`,
      category: 'fashion', subcategory: 'shoes', subSubcategory: 'formal-shoes',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 15, max: 100 }), sold: faker.number.int({ min: 30, max: 400 }), reserved: 0, warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        sizes:    ['6','7','8','9','10','11','12'],
        color:    faker.helpers.arrayElement(['Black','Brown','Tan','Burgundy']),
        material: faker.helpers.arrayElement(['Full-grain Leather','Genuine Leather','Suede']),
        occasion: 'Formal',
        sole:     faker.helpers.arrayElement(['Leather Sole','Rubber Sole','Crepe Sole']),
        closure:  'Lace-up',
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#000000', size: '10', image: media.small, stock: faker.number.int({ min: 8, max: 30 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Brown', colorHex: '#5c3317', size: '10', image: media.small, stock: faker.number.int({ min: 5, max: 20 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — premium leather, formal style.`, keywords: ['formal shoes', 'leather shoes', brand.toLowerCase(), style.toLowerCase()], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('900g'),
      tags: ['shoes', 'formal', 'leather', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.2 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeCasualShoes() {
  const brands = ['Nike','Adidas','Vans','Converse']
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const model = faker.helpers.arrayElement(['Air Force 1','Stan Smith','Old Skool','Chuck Taylor'])
    const title = `${brand} ${model} Casual Sneakers`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `casual-sneakers-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 49, max: 149 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `The ${title} is an iconic sneaker with timeless style. Versatile enough for everyday wear with superior comfort and durability.`,
      category: 'fashion', subcategory: 'shoes', subSubcategory: 'casual-shoes',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 30, max: 200 }), sold: faker.number.int({ min: 100, max: 2000 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        sizes:    ['6','7','8','9','10','11','12','13'],
        color:    faker.helpers.arrayElement(['White','Black','Gray','Navy','Red']),
        material: faker.helpers.arrayElement(['Canvas','Leather','Mesh','Suede']),
        occasion: 'Casual',
        sole:     'Rubber',
        closure:  'Lace-up',
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'White', colorHex: '#ffffff', size: '10', image: media.small, stock: faker.number.int({ min: 15, max: 60 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Black', colorHex: '#000000', size: '10', image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — iconic style, everyday comfort.`, keywords: ['sneakers', 'casual shoes', brand.toLowerCase(), model.toLowerCase()], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('700g'),
      tags: ['sneakers', 'casual', 'shoes', brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeSportsShoes() {
  const brands = ['Nike','Adidas','Brooks','ASICS']
  return Promise.all(Array.from({ length: 4 }, async (_, i) => {
    const brand = brands[i]
    const id    = pid()
    const model = faker.helpers.arrayElement(['Air Zoom Pegasus 41','Ultraboost 22','Ghost 16','Gel-Kayano 31'])
    const title = `${brand} ${model} Running Shoes`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const keyword = `running-shoes-${i + 1}`
    const media = await fetchImage(keyword)
    const original = faker.number.int({ min: 79, max: 199 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand,
      description: `The ${title} is engineered for maximum performance with responsive cushioning and breathable upper. Ideal for daily training runs and race day.`,
      category: 'fashion', subcategory: 'shoes', subSubcategory: 'sports-shoes',
      imgKeyword: keyword,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 150 }), sold: faker.number.int({ min: 80, max: 1500 }), reserved: 0, warehouse: 'WH-West-01', restockDate: null },
      attributes: {
        sizes:    ['6','7','8','9','10','11','12','13'],
        color:    faker.helpers.arrayElement(['Black/White','Blue/Orange','Gray/Green','All Black']),
        material: 'Engineered Mesh',
        occasion: 'Sports',
        sole:     'EVA Foam',
        closure:  'Lace-up',
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#000000', size: '10', image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Blue', colorHex: '#0055aa', size: '10', image: media.small, stock: faker.number.int({ min: 8, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — high performance, superior cushioning.`, keywords: ['running shoes', 'sports shoes', brand.toLowerCase(), 'training'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('700g'),
      tags: ['running', 'sports', 'shoes', brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.25 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeAppliances() {
  const items = [
    ['Ninja','Professional Blender 1500W','kitchen-blender'],
    ['Instant Pot','Duo 7-in-1 Electric Pressure Cooker','pressure-cooker'],
    ['Keurig','K-Elite Coffee Maker','coffee-maker'],
    ['Philips','XXL Air Fryer 7.3L','air-fryer'],
    ['KitchenAid','Artisan Stand Mixer 5QT','stand-mixer'],
    ['Dyson','V15 Detect Cordless Vacuum','vacuum-cleaner'],
    ['Breville','Smart Oven Air Fryer Pro','toaster-oven'],
    ['De\'Longhi','Magnifica Evo Espresso Machine','espresso-machine'],
    ['Vitamix','5200 Blender','vitamix-blender'],
    ['Cuisinart','14-Cup Food Processor','food-processor'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 49, max: 599 })
    const disc     = faker.number.int({ min: 10, max: 35 })
    return {
      id, slug, title, brand,
      description: `The ${title} is designed for the modern kitchen with professional-grade performance. Built to last with premium materials and intuitive controls.`,
      category: 'home-kitchen', subcategory: 'appliances', subSubcategory: 'kitchen-appliances',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 10, max: 100 }), sold: faker.number.int({ min: 50, max: 800 }), reserved: 0, warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        powerConsumption: faker.helpers.arrayElement(['500W','800W','1000W','1200W','1500W','2000W']),
        capacity:         faker.helpers.arrayElement(['1L','1.5L','2L','5L','7L','10L']),
        color:            faker.helpers.arrayElement(['Black','White','Silver','Red','Graphite']),
        warranty:         faker.helpers.arrayElement(['1 Year','2 Years','3 Years','5 Years']),
        energyRating:     faker.helpers.arrayElement(['A+','A++','A+++','B']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: faker.helpers.arrayElement(['Black','Silver','White']), colorHex: '#2a2a2a', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — premium kitchen appliance for modern homes.`, keywords: [keyword, 'kitchen', brand.toLowerCase(), 'appliance'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping(`${faker.number.float({ min: 1.5, max: 8.0, fractionDigits: 1 })}kg`),
      tags: ['kitchen', 'appliance', keyword, brand.toLowerCase().replace(' ', '-').replace("'", '')],
      isFeatured: faker.datatype.boolean({ probability: 0.2 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeSkincare() {
  const items = [
    ['CeraVe','Moisturizing Cream 16oz','skincare-moisturizer'],
    ['The Ordinary','Hyaluronic Acid 2% + B5 Serum','skincare-serum'],
    ['Neutrogena','Hydro Boost Water Gel SPF 30','sunscreen-skincare'],
    ['La Roche-Posay','Toleriane Double Repair Moisturizer','skincare-lotion'],
    ['Tatcha','The Dewy Skin Cream','luxury-skincare'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 15, max: 89 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `${title} is formulated with dermatologist-tested ingredients for optimal skin hydration and barrier repair. Suitable for daily use and all skin types.`,
      category: 'beauty', subcategory: 'skincare', subSubcategory: 'face-care',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 30, max: 300 }), sold: faker.number.int({ min: 100, max: 2000 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        skinType:       faker.helpers.arrayElement(['All Skin Types','Dry Skin','Oily Skin','Combination','Sensitive']),
        crueltyFree:    faker.datatype.boolean({ probability: 0.7 }),
        volume:         faker.helpers.arrayElement(['30ml','50ml','100ml','150ml','250ml','454g']),
        keyIngredients: faker.helpers.arrayElement(['Hyaluronic Acid, Ceramides','Vitamin C, Niacinamide','Retinol, Peptides','SPF 30, Zinc Oxide']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Standard', colorHex: '#f0e6d3', size: null, image: media.small, stock: faker.number.int({ min: 15, max: 80 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Skincare Price`, metaDescription: `${title} — dermatologist tested, suitable for all skin types.`, keywords: ['skincare', 'moisturizer', brand.toLowerCase(), 'face cream'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('350g'),
      tags: ['skincare', 'beauty', 'moisturizer', brand.toLowerCase().replace(' ', '-').replace("'", '')],
      isFeatured: faker.datatype.boolean({ probability: 0.25 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeMakeup() {
  const items = [
    ['MAC','Studio Fix Fluid Foundation SPF 15','foundation-makeup'],
    ['Charlotte Tilbury','Matte Revolution Lipstick','lipstick-makeup'],
    ['NARS','Radiant Creamy Concealer','concealer-makeup'],
    ['Urban Decay','All Nighter Long Lasting Makeup Setting Spray','makeup-setting-spray'],
    ['Too Faced','Better Than Sex Mascara','mascara-makeup'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 18, max: 69 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand,
      description: `${title} delivers professional-quality results with a formula that lasts all day. A cult-favorite product trusted by makeup artists worldwide.`,
      category: 'beauty', subcategory: 'makeup', subSubcategory: 'face-makeup',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 30, max: 300 }), sold: faker.number.int({ min: 150, max: 3000 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        shade:      faker.helpers.arrayElement(['Fair','Light','Medium','Tan','Deep','Universal']),
        finish:     faker.helpers.arrayElement(['Matte','Dewy','Satin','Glossy','Natural']),
        crueltyFree: faker.datatype.boolean({ probability: 0.6 }),
        volume:     faker.helpers.arrayElement(['3ml','5ml','10ml','30ml','50ml']),
        coverage:   faker.helpers.arrayElement(['Light','Medium','Full','Buildable']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Fair/Light', colorHex: '#f5d5b8', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 50 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Medium/Tan', colorHex: '#c68642', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 40 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — professional makeup, long-lasting formula.`, keywords: ['makeup', 'cosmetics', brand.toLowerCase(), keyword], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('150g'),
      tags: ['makeup', 'beauty', 'cosmetics', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.25 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeSportsEquipment() {
  const items = [
    ['Bowflex','SelectTech 552 Adjustable Dumbbells','dumbbell-fitness'],
    ['Lululemon','The Reversible Yoga Mat 5mm','yoga-mat'],
    ['TRX','All-in-One Suspension Trainer','trx-suspension-trainer'],
    ['Bowflex','BodyTower Pull-Up Bar','pull-up-bar'],
    ['Manduka','PRO Yoga Mat 6mm','premium-yoga-mat'],
    ['Rogue','Echo Bumper Plates 45lb','weight-plates'],
    ['Nike','Resistance Bands Set 5 Pack','resistance-bands'],
    ['SKLZ','Agility Ladder 11 Step','agility-ladder'],
    ['CAP Barbell','Olympic Hex Trap Bar','trap-bar'],
    ['Life Fitness','Adjustable Bench','weight-bench'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 19, max: 499 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `The ${title} is engineered for serious athletes and fitness enthusiasts. Premium build quality ensures safety and durability through intense workouts.`,
      category: 'sports-fitness', subcategory: 'equipment', subSubcategory: 'gym-equipment',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 10, max: 100 }), sold: faker.number.int({ min: 50, max: 800 }), reserved: 0, warehouse: 'WH-West-01', restockDate: null },
      attributes: {
        material:     faker.helpers.arrayElement(['Rubber','Neoprene','Steel','Aluminum','Foam','Nylon']),
        weight:       faker.helpers.arrayElement(['0.5kg','1kg','2kg','5kg','10kg','20kg','45kg']),
        targetMuscle: faker.helpers.arrayElement(['Full Body','Arms & Shoulders','Legs & Glutes','Core & Abs','Back & Chest']),
        difficulty:   faker.helpers.arrayElement(['Beginner','Intermediate','Advanced','All Levels']),
        dimensions:   faker.helpers.arrayElement(['30x30cm','45x180cm','60x120cm','Standard','Adjustable']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#1a1a1a', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 30 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — professional fitness equipment for home and gym.`, keywords: ['fitness', 'gym equipment', brand.toLowerCase(), keyword], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping(`${faker.number.float({ min: 0.5, max: 25.0, fractionDigits: 1 })}kg`),
      tags: ['fitness', 'gym', 'sports', brand.toLowerCase().replace(' ', '-')],
      isFeatured: faker.datatype.boolean({ probability: 0.2 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeTechBooks() {
  const items = [
    ['O\'Reilly','Clean Code: A Handbook of Agile Software Craftsmanship','Robert C. Martin','programming-book','9780132350884'],
    ['Addison-Wesley','The Pragmatic Programmer 20th Anniversary Edition','David Thomas','developer-book','9780135957059'],
    ['O\'Reilly','You Don\'t Know JS Yet: Get Started','Kyle Simpson','javascript-book','9781492017394'],
    ['No Starch Press','The Linux Command Line 2nd Edition','William Shotts','linux-book','9781593279523'],
  ]
  return Promise.all(items.map(async ([publisher, model, author, keyword, isbn], i) => {
    const id    = pid()
    const title = model as string
    const brand = publisher as string
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 29, max: 59 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand,
      description: `${title} by ${author} is an essential read for software developers. This comprehensive guide covers fundamental concepts with practical examples and real-world applications.`,
      category: 'books', subcategory: 'tech-books', subSubcategory: 'programming',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 20, max: 200 }), sold: faker.number.int({ min: 100, max: 2000 }), reserved: 0, warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        author,
        pages:     faker.helpers.arrayElement([250, 320, 400, 464, 506, 560]),
        language:  'English',
        format:    faker.helpers.arrayElement(['Paperback','Hardcover','Ebook']),
        genre:     'Technology & Programming',
        publisher: brand,
        isbn,
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Paperback', colorHex: '#f5f0e8', size: null, image: media.small, stock: faker.number.int({ min: 10, max: 60 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Hardcover', colorHex: '#8b6914', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 20 }), priceDiff: 15 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} by ${author} — must-read for developers.`, keywords: ['programming book', 'tech book', (author as string).toLowerCase().split(' ')[0], 'software'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('600g'),
      tags: ['book', 'tech', 'programming', (author as string).toLowerCase().split(' ')[1]],
      isFeatured: faker.datatype.boolean({ probability: 0.3 }), isActive: true,
      createdAt: faker.date.between({ from: '2022-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeSelfHelpBooks() {
  const items = [
    ['Penguin','Atomic Habits: An Easy & Proven Way to Build Good Habits','James Clear','self-help-book','9780735211292'],
    ['Simon & Schuster','The 7 Habits of Highly Effective People','Stephen R. Covey','motivation-book','9781982137274'],
    ['Crown','Can\'t Hurt Me: Master Your Mind and Defy the Odds','David Goggins','mindset-book','9781544512273'],
    ['Hay House','The Power of Now: A Guide to Spiritual Enlightenment','Eckhart Tolle','spiritual-book','9781577314806'],
  ]
  return Promise.all(items.map(async ([publisher, model, author, keyword, isbn], i) => {
    const id    = pid()
    const title = model as string
    const brand = publisher as string
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 14, max: 29 })
    const disc     = faker.number.int({ min: 5, max: 20 })
    return {
      id, slug, title, brand,
      description: `${title} by ${author} has transformed millions of lives worldwide. This #1 bestseller provides actionable strategies and insights for personal growth and success.`,
      category: 'books', subcategory: 'self-help', subSubcategory: 'personal-development',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 30, max: 300 }), sold: faker.number.int({ min: 500, max: 10000 }), reserved: 0, warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        author,
        pages:     faker.helpers.arrayElement([240, 288, 320, 366, 400]),
        language:  'English',
        format:    faker.helpers.arrayElement(['Paperback','Hardcover','Ebook','Audiobook']),
        genre:     'Self-Help & Personal Development',
        publisher: brand,
        isbn,
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Paperback', colorHex: '#f5f0e8', size: null, image: media.small, stock: faker.number.int({ min: 20, max: 80 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} by ${author} — bestselling self-help book.`, keywords: ['self-help', 'personal development', (author as string).toLowerCase().split(' ')[0], 'bestseller'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('400g'),
      tags: ['book', 'self-help', 'motivation', (author as string).toLowerCase().split(' ')[1]],
      isFeatured: faker.datatype.boolean({ probability: 0.35 }), isActive: true,
      createdAt: faker.date.between({ from: '2022-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeBags() {
  const items = [
    ['Herschel','Little America Backpack 30L','leather-backpack'],
    ['Tumi','Alpha 3 Brief Pack Laptop Backpack','business-backpack'],
    ['Fossil','Buckner Leather Messenger Bag','messenger-bag'],
    ['Coach','Charter Crossbody Bag','crossbody-bag'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 49, max: 499 })
    const disc     = faker.number.int({ min: 5, max: 25 })
    return {
      id, slug, title, brand,
      description: `The ${title} combines style and functionality with premium materials. Thoughtfully designed compartments keep your essentials organized on the go.`,
      category: 'accessories', subcategory: 'bags', subSubcategory: 'bags-luggage',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 10, max: 80 }), sold: faker.number.int({ min: 30, max: 500 }), reserved: 0, warehouse: 'WH-Central-01', restockDate: null },
      attributes: {
        material:     faker.helpers.arrayElement(['Genuine Leather','Full-grain Leather','Canvas','Ballistic Nylon','Vegan Leather']),
        color:        faker.helpers.arrayElement(['Black','Brown','Tan','Navy','Olive','Gray']),
        type:         faker.helpers.arrayElement(['Backpack','Messenger','Crossbody','Tote','Duffel']),
        dimensions:   faker.helpers.arrayElement(['30x40x15cm','40x50x20cm','25x35x10cm','35x45x18cm']),
        closure:      faker.helpers.arrayElement(['Zipper','Magnetic Snap','Drawstring','Buckle + Zipper']),
        compartments: faker.helpers.arrayElement(['2','3','4','5+']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Black', colorHex: '#000000', size: null, image: media.small, stock: faker.number.int({ min: 5, max: 25 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Brown', colorHex: '#5c3317', size: null, image: media.small, stock: faker.number.int({ min: 3, max: 15 }), priceDiff: 0 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — premium quality, stylish design for everyday use.`, keywords: ['bag', keyword.replace('-', ' '), brand.toLowerCase(), 'accessories'], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping(`${faker.number.float({ min: 0.5, max: 1.5, fractionDigits: 1 })}kg`),
      tags: ['bag', 'accessories', keyword.split('-')[0], brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.25 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-06-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-06-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

async function makeWatches() {
  const items = [
    ['Rolex','Submariner Date 41mm','luxury-wristwatch'],
    ['Apple','Watch Series 10 GPS + Cellular 46mm','apple-watch-smartwatch'],
    ['Seiko','Presage Cocktail Time Automatic','automatic-watch'],
    ['Garmin','Fenix 8 Solar GPS Multisport Watch','garmin-smartwatch'],
  ]
  return Promise.all(items.map(async ([brand, model, keyword], i) => {
    const id    = pid()
    const title = `${brand} ${model}`
    const slug  = slugify(`${title}-${id}`, { lower: true, strict: true })
    const media = await fetchImage(`${keyword}-${i + 1}`)
    const original = faker.number.int({ min: 199, max: 12999 })
    const disc     = faker.number.int({ min: 3, max: 15 })
    return {
      id, slug, title, brand,
      description: `The ${title} represents the pinnacle of watchmaking craftsmanship. Combining precision engineering with timeless aesthetics for the discerning wearer.`,
      category: 'accessories', subcategory: 'watches', subSubcategory: 'wristwatches',
      imgKeyword: `${keyword}-${i + 1}`,
      ...makeFlags(),
      pricing: makePricing(original, disc),
      inventory: { stock: faker.number.int({ min: 5, max: 50 }), sold: faker.number.int({ min: 20, max: 500 }), reserved: faker.number.int({ min: 0, max: 5 }), warehouse: 'WH-East-01', restockDate: null },
      attributes: {
        material:        faker.helpers.arrayElement(['Stainless Steel','Titanium','Ceramic Bezel + Steel','Carbon Fiber']),
        color:           faker.helpers.arrayElement(['Silver','Gold','Black','Rose Gold','Blue']),
        type:            faker.helpers.arrayElement(['Analog','Smartwatch','Chronograph','Dive Watch']),
        movement:        faker.helpers.arrayElement(['Automatic','Quartz','Solar-Powered','GPS Smart']),
        waterResistance: faker.helpers.arrayElement(['100m','200m','300m','50m + 5ATM']),
        dialSize:        faker.helpers.arrayElement(['38mm','40mm','41mm','44mm','46mm']),
      },
      variants: [
        { variantId: `var_${id}_a`, color: 'Silver/Black', colorHex: '#c0c0c0', size: null, image: media.small, stock: faker.number.int({ min: 3, max: 15 }), priceDiff: 0 },
        { variantId: `var_${id}_b`, color: 'Gold/Brown', colorHex: '#b8860b', size: null, image: media.small, stock: faker.number.int({ min: 2, max: 10 }), priceDiff: 500 },
      ],
      media: { ...media, video: null, threeSixtyView: false },
      ratings: makeRatings(),
      reviews: makeReviews(id),
      seo: { metaTitle: `Buy ${title} | Best Price`, metaDescription: `${title} — luxury timepiece, precision engineering.`, keywords: ['watch', 'wristwatch', brand.toLowerCase(), keyword.split('-')[0]], canonicalUrl: `/products/${slug}` },
      shipping: makeShipping('200g'),
      tags: ['watch', 'accessories', 'luxury', brand.toLowerCase()],
      isFeatured: faker.datatype.boolean({ probability: 0.4 }), isActive: true,
      createdAt: faker.date.between({ from: '2023-01-01', to: '2024-09-01' }).toISOString(),
      updatedAt: faker.date.between({ from: '2024-09-01', to: '2025-02-01' }).toISOString(),
    }
  }))
}

// Direct Unsplash image URL for category/avatar/banner (displayable in browser)
const UNSPLASH_CAT_IMG = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop&auto=format'

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
function makeCategories() {
  return [
    { id: 'cat_001', name: 'Electronics', slug: 'electronics', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'Zap', description: 'Latest gadgets, laptops, phones and audio devices.', productCount: 33, isActive: true, isFeatured: true, sortOrder: 1, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'price', label: 'Price Range', type: 'range' }, { key: 'rating', label: 'Rating', type: 'rating' }] },
    { id: 'cat_002', name: 'Laptops', slug: 'laptops', parentId: 'cat_001', level: 1, image: UNSPLASH_CAT_IMG, icon: 'Laptop', description: 'Gaming laptops, ultrabooks and business laptops.', productCount: 11, isActive: true, isFeatured: true, sortOrder: 1, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'ram', label: 'RAM', type: 'checkbox' }, { key: 'storage', label: 'Storage', type: 'checkbox' }, { key: 'processor', label: 'Processor', type: 'checkbox' }, { key: 'gpu', label: 'GPU', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_003', name: 'Gaming Laptops', slug: 'gaming-laptops', parentId: 'cat_002', level: 2, image: UNSPLASH_CAT_IMG, icon: 'Gamepad2', description: 'High performance gaming laptops with latest GPUs.', productCount: 6, isActive: true, isFeatured: false, sortOrder: 1, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'gpu', label: 'GPU', type: 'checkbox' }, { key: 'ram', label: 'RAM', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_004', name: 'Ultrabooks', slug: 'ultrabooks', parentId: 'cat_002', level: 2, image: UNSPLASH_CAT_IMG, icon: 'Laptop', description: 'Ultra-thin, lightweight laptops for professionals.', productCount: 5, isActive: true, isFeatured: false, sortOrder: 2, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'ram', label: 'RAM', type: 'checkbox' }, { key: 'batteryLife', label: 'Battery Life', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_005', name: 'Smartphones', slug: 'smartphones', parentId: 'cat_001', level: 1, image: UNSPLASH_CAT_IMG, icon: 'Smartphone', description: 'Android phones, iPhones and flagship devices.', productCount: 12, isActive: true, isFeatured: true, sortOrder: 2, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'ram', label: 'RAM', type: 'checkbox' }, { key: 'storage', label: 'Storage', type: 'checkbox' }, { key: 'camera', label: 'Camera', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_006', name: 'Android', slug: 'android', parentId: 'cat_005', level: 2, image: UNSPLASH_CAT_IMG, icon: 'Smartphone', description: 'Latest Android flagship and mid-range phones.', productCount: 8, isActive: true, isFeatured: false, sortOrder: 1, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'ram', label: 'RAM', type: 'checkbox' }, { key: 'storage', label: 'Storage', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_007', name: 'iPhone', slug: 'iphone', parentId: 'cat_005', level: 2, image: UNSPLASH_CAT_IMG, icon: 'Smartphone', description: 'Apple iPhone 16 series and previous models.', productCount: 4, isActive: true, isFeatured: true, sortOrder: 2, filters: [{ key: 'storage', label: 'Storage', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_008', name: 'Audio', slug: 'audio', parentId: 'cat_001', level: 1, image: UNSPLASH_CAT_IMG, icon: 'Headphones', description: 'Headphones, earbuds and speakers.', productCount: 10, isActive: true, isFeatured: true, sortOrder: 3, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'connectivity', label: 'Connectivity', type: 'checkbox' }, { key: 'noiseCancellation', label: 'ANC', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_009', name: 'Fashion', slug: 'fashion', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'Shirt', description: 'Trendy clothing, shoes and accessories for men.', productCount: 37, isActive: true, isFeatured: true, sortOrder: 2, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }, { key: 'rating', label: 'Rating', type: 'rating' }] },
    { id: 'cat_010', name: 'Mens Clothing', slug: 'mens-clothing', parentId: 'cat_009', level: 1, image: UNSPLASH_CAT_IMG, icon: 'Shirt', description: 'Shirts, pants, jackets and more for men.', productCount: 15, isActive: true, isFeatured: false, sortOrder: 1, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'sizes', label: 'Size', type: 'checkbox' }, { key: 'color', label: 'Color', type: 'checkbox' }, { key: 'fabric', label: 'Fabric', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_011', name: 'Shoes', slug: 'shoes', parentId: 'cat_009', level: 1, image: UNSPLASH_CAT_IMG, icon: 'Footprints', description: 'Formal, casual and sports shoes for men.', productCount: 12, isActive: true, isFeatured: true, sortOrder: 2, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'sizes', label: 'Size', type: 'checkbox' }, { key: 'color', label: 'Color', type: 'checkbox' }, { key: 'material', label: 'Material', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_012', name: 'Home & Kitchen', slug: 'home-kitchen', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'UtensilsCrossed', description: 'Kitchen appliances and home essentials.', productCount: 10, isActive: true, isFeatured: true, sortOrder: 3, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }, { key: 'rating', label: 'Rating', type: 'rating' }] },
    { id: 'cat_013', name: 'Beauty', slug: 'beauty', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'Sparkles', description: 'Skincare, makeup and beauty products.', productCount: 10, isActive: true, isFeatured: true, sortOrder: 4, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'skinType', label: 'Skin Type', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_014', name: 'Sports & Fitness', slug: 'sports-fitness', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'Dumbbell', description: 'Gym equipment, sports gear and fitness accessories.', productCount: 10, isActive: true, isFeatured: true, sortOrder: 5, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'targetMuscle', label: 'Target Muscle', type: 'checkbox' }, { key: 'difficulty', label: 'Difficulty', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_015', name: 'Books', slug: 'books', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'BookOpen', description: 'Tech books, self-help, fiction and more.', productCount: 8, isActive: true, isFeatured: false, sortOrder: 6, filters: [{ key: 'author', label: 'Author', type: 'checkbox' }, { key: 'format', label: 'Format', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
    { id: 'cat_016', name: 'Accessories', slug: 'accessories', parentId: null, level: 0, image: UNSPLASH_CAT_IMG, icon: 'Watch', description: 'Bags, watches and fashion accessories.', productCount: 8, isActive: true, isFeatured: true, sortOrder: 7, filters: [{ key: 'brand', label: 'Brand', type: 'checkbox' }, { key: 'material', label: 'Material', type: 'checkbox' }, { key: 'price', label: 'Price', type: 'range' }] },
  ]
}

// ─── USERS ────────────────────────────────────────────────────────────────────
function makeUsers() {
  const firstNames = ['James','Emma','Liam','Olivia','Noah','Ava','William','Sophia','Benjamin','Isabella']
  const lastNames  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Moore']
  return Array.from({ length: 10 }, (_, i) => ({
    id:           `usr_${String(i + 1).padStart(3, '0')}`,
    email:        `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@example.com`,
    passwordHash: '$2b$10$exampleHashedPasswordForDemoOnly123456789',
    firstName:    firstNames[i],
    lastName:     lastNames[i],
    avatar:       UNSPLASH_CAT_IMG,
    phone:        `+1-555-${String(faker.number.int({ min: 1000, max: 9999 })).padStart(4, '0')}`,
    role:         i === 0 ? 'admin' : 'customer',
    addresses: [{
      id:        `addr_${String(i + 1).padStart(3, '0')}_01`,
      label:     'Home',
      street:    faker.location.streetAddress(),
      city:      faker.location.city(),
      state:     faker.location.state({ abbreviated: true }),
      zip:       faker.location.zipCode(),
      country:   'USA',
      isDefault: true,
    }],
    wishlist:      [],
    loyaltyPoints: faker.number.int({ min: 0, max: 2000 }),
    memberSince:   faker.date.between({ from: '2022-01-01', to: '2024-01-01' }).toISOString(),
    lastLogin:     faker.date.between({ from: '2025-01-01', to: '2025-02-20' }).toISOString(),
    isVerified:    true,
    isActive:      true,
  }))
}

// ─── COUPONS ──────────────────────────────────────────────────────────────────
function makeCoupons() {
  return [
    { id: 'coup_001', code: 'SAVE10', type: 'percentage', value: 10, minOrderAmount: 50, maxDiscount: 30, usageLimit: 500, usedCount: 234, applicableCategories: [], applicableProducts: [], expiresAt: '2025-12-31T23:59:59Z', isActive: true },
    { id: 'coup_002', code: 'SAVE20', type: 'percentage', value: 20, minOrderAmount: 100, maxDiscount: 50, usageLimit: 200, usedCount: 89, applicableCategories: [], applicableProducts: [], expiresAt: '2025-12-31T23:59:59Z', isActive: true },
    { id: 'coup_003', code: 'SAVE50', type: 'fixed', value: 50, minOrderAmount: 200, maxDiscount: 50, usageLimit: 100, usedCount: 45, applicableCategories: [], applicableProducts: [], expiresAt: '2025-06-30T23:59:59Z', isActive: true },
    { id: 'coup_004', code: 'FREESHIP', type: 'free_shipping', value: 0, minOrderAmount: 30, maxDiscount: 20, usageLimit: 1000, usedCount: 456, applicableCategories: [], applicableProducts: [], expiresAt: '2025-12-31T23:59:59Z', isActive: true },
    { id: 'coup_005', code: 'TECH15', type: 'percentage', value: 15, minOrderAmount: 150, maxDiscount: 100, usageLimit: 150, usedCount: 67, applicableCategories: ['electronics'], applicableProducts: [], expiresAt: '2025-09-30T23:59:59Z', isActive: true },
    { id: 'coup_006', code: 'FASHION25', type: 'percentage', value: 25, minOrderAmount: 80, maxDiscount: 60, usageLimit: 200, usedCount: 112, applicableCategories: ['fashion'], applicableProducts: [], expiresAt: '2025-08-31T23:59:59Z', isActive: true },
    { id: 'coup_007', code: 'NEWUSER30', type: 'percentage', value: 30, minOrderAmount: 50, maxDiscount: 40, usageLimit: 50, usedCount: 0, applicableCategories: [], applicableProducts: [], expiresAt: '2025-12-31T23:59:59Z', isActive: true },
    { id: 'coup_008', code: 'EXPIRED10', type: 'percentage', value: 10, minOrderAmount: 0, maxDiscount: 20, usageLimit: 100, usedCount: 100, applicableCategories: [], applicableProducts: [], expiresAt: '2024-01-01T00:00:00Z', isActive: false },
  ]
}

// ─── BANNERS ──────────────────────────────────────────────────────────────────
function makeBanners() {
  return [
    { id: 'ban_001', title: 'Summer Tech Sale — Up to 40% Off', subtitle: 'Shop the best deals on laptops, phones and audio', image: UNSPLASH_CAT_IMG, ctaText: 'Shop Now', ctaLink: '/products?onSale=true&category=electronics', position: 'hero', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 1 },
    { id: 'ban_002', title: 'New iPhone 16 Series — Available Now', subtitle: 'Experience the future of smartphones', image: UNSPLASH_CAT_IMG, ctaText: 'Explore', ctaLink: '/products?subcategory=iphone', position: 'hero', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 2 },
    { id: 'ban_003', title: 'Fashion Week Sale — 25% Off All Clothing', subtitle: 'Refresh your wardrobe with premium brands', image: UNSPLASH_CAT_IMG, ctaText: 'Shop Fashion', ctaLink: '/products?category=fashion&onSale=true', position: 'hero', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 3 },
    { id: 'ban_004', title: 'Free Shipping on Orders Over $50', subtitle: 'Use code FREESHIP at checkout', image: UNSPLASH_CAT_IMG, ctaText: 'Shop All', ctaLink: '/products', position: 'sidebar', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 1 },
    { id: 'ban_005', title: 'Gaming Setup Week — Massive Discounts', subtitle: 'Build your dream gaming station', image: UNSPLASH_CAT_IMG, ctaText: 'View Deals', ctaLink: '/products?subSubcategory=gaming-laptops&onSale=true', position: 'category_top', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 1 },
    { id: 'ban_006', title: 'Beauty & Skincare — New Arrivals', subtitle: 'Discover the latest in skincare and makeup', image: UNSPLASH_CAT_IMG, ctaText: 'Discover', ctaLink: '/products?category=beauty&newArrival=true', position: 'category_top', startDate: '2025-01-01T00:00:00Z', endDate: '2025-12-31T23:59:59Z', isActive: true, sortOrder: 2 },
  ]
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
function makeOrders(products: any[]) {
  const statuses = ['pending','confirmed','processing','shipped','delivered','cancelled']
  return Array.from({ length: 20 }, (_, i) => {
    const userId   = `usr_${String(faker.number.int({ min: 1, max: 10 })).padStart(3, '0')}`
    const status   = faker.helpers.arrayElement(statuses)
    const numItems = faker.number.int({ min: 1, max: 4 })
    const items    = Array.from({ length: numItems }, () => {
      const product  = faker.helpers.arrayElement(products)
      const quantity = faker.number.int({ min: 1, max: 3 })
      return {
        productId:  product.id,
        variantId:  product.variants[0]?.variantId ?? null,
        title:      product.title,
        image:      product.media.small,
        price:      product.pricing.current,
        quantity,
        subtotal:   parseFloat((product.pricing.current * quantity).toFixed(2)),
      }
    })
    const subtotal    = parseFloat(items.reduce((a, b) => a + b.subtotal, 0).toFixed(2))
    const shipping    = subtotal > 50 ? 0 : 9.99
    const tax         = parseFloat((subtotal * 0.1).toFixed(2))
    const coupon      = faker.datatype.boolean({ probability: 0.3 }) ? { code: 'SAVE10', discountValue: parseFloat((subtotal * 0.1).toFixed(2)) } : null
    const couponDisc  = coupon ? coupon.discountValue : 0
    const total       = parseFloat((subtotal + shipping + tax - couponDisc).toFixed(2))
    const orderDate   = faker.date.between({ from: '2024-06-01', to: '2025-02-01' })
    const timeline = [
      { status: 'confirmed',  timestamp: new Date(orderDate.getTime() + 3600000).toISOString(),    message: 'Order confirmed and payment received' },
      { status: 'processing', timestamp: new Date(orderDate.getTime() + 86400000).toISOString(),   message: 'Order is being packed at warehouse' },
      ...(status !== 'pending' && status !== 'confirmed' ? [{ status: 'shipped', timestamp: new Date(orderDate.getTime() + 172800000).toISOString(), message: `Shipped via FedEx. Tracking: TRK${faker.number.int({ min: 100000000, max: 999999999 })}` }] : []),
      ...(status === 'delivered' ? [{ status: 'delivered', timestamp: new Date(orderDate.getTime() + 432000000).toISOString(), message: 'Package delivered successfully' }] : []),
      ...(status === 'cancelled' ? [{ status: 'cancelled', timestamp: new Date(orderDate.getTime() + 3600000).toISOString(), message: 'Order cancelled by customer' }] : []),
    ]
    return {
      id:              `ORD-2025-${String(i + 1).padStart(5, '0')}`,
      userId,
      status,
      items,
      pricing: { subtotal, shipping, tax, discount: 0, couponDiscount: couponDisc, total },
      couponApplied:   coupon,
      shippingAddress: {
        id:      `addr_${String(faker.number.int({ min: 1, max: 10 })).padStart(3, '0')}_01`,
        label:   'Home',
        street:  faker.location.streetAddress(),
        city:    faker.location.city(),
        state:   faker.location.state({ abbreviated: true }),
        zip:     faker.location.zipCode(),
        country: 'USA',
        isDefault: true,
      },
      paymentMethod:     faker.helpers.arrayElement(['card','paypal','apple_pay','google_pay']),
      paymentStatus:     status === 'cancelled' ? 'refunded' : 'paid',
      timeline,
      trackingNumber:    status === 'shipped' || status === 'delivered' ? `TRK${faker.number.int({ min: 100000000, max: 999999999 })}` : null,
      estimatedDelivery: new Date(orderDate.getTime() + 432000000).toISOString(),
      createdAt:         orderDate.toISOString(),
      updatedAt:         new Date(orderDate.getTime() + 172800000).toISOString(),
    }
  })
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starting data generation...')
  console.log('📸 Fetching images from Unsplash API (500ms delay between requests)...')
  console.log('⏱️  This will take ~2 minutes for 120+ products...\n')

  const dataDir = path.join(__dirname, '../data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  console.log('🎮 Generating Electronics (Gaming Laptops)...')
  const gamingLaptops = await makeGamingLaptops()
  console.log('💻 Generating Electronics (Ultrabooks)...')
  const ultrabooks = await makeUltrabooks()
  console.log('📱 Generating Electronics (Android Phones)...')
  const androidPhones = await makeAndroidPhones()
  console.log('🍎 Generating Electronics (iPhones)...')
  const iphones = await makeiPhones()
  console.log('🎧 Generating Electronics (Headphones)...')
  const headphones = await makeHeadphones()
  console.log('🎵 Generating Electronics (Earbuds)...')
  const earbuds = await makeEarbuds()
  console.log('🔊 Generating Electronics (Speakers)...')
  const speakers = await makeSpeakers()
  console.log('👔 Generating Fashion (Shirts)...')
  const shirts = await makeShirts()
  console.log('👖 Generating Fashion (Pants)...')
  const pants = await makePants()
  console.log('🧥 Generating Fashion (Jackets)...')
  const jackets = await makeJackets()
  console.log('👞 Generating Fashion (Formal Shoes)...')
  const formalShoes = await makeFormalShoes()
  console.log('👟 Generating Fashion (Casual Shoes)...')
  const casualShoes = await makeCasualShoes()
  console.log('🏃 Generating Fashion (Sports Shoes)...')
  const sportsShoes = await makeSportsShoes()
  console.log('🍳 Generating Home & Kitchen (Appliances)...')
  const appliances = await makeAppliances()
  console.log('💄 Generating Beauty (Skincare)...')
  const skincare = await makeSkincare()
  console.log('💋 Generating Beauty (Makeup)...')
  const makeup = await makeMakeup()
  console.log('🏋️ Generating Sports & Fitness (Equipment)...')
  const sportsEquip = await makeSportsEquipment()
  console.log('📚 Generating Books (Tech)...')
  const techBooks = await makeTechBooks()
  console.log('📖 Generating Books (Self-Help)...')
  const selfHelpBooks = await makeSelfHelpBooks()
  console.log('👜 Generating Accessories (Bags)...')
  const bags = await makeBags()
  console.log('⌚ Generating Accessories (Watches)...')
  const watches = await makeWatches()

  const allProducts = [
    ...gamingLaptops, ...ultrabooks, ...androidPhones, ...iphones,
    ...headphones, ...earbuds, ...speakers,
    ...shirts, ...pants, ...jackets,
    ...formalShoes, ...casualShoes, ...sportsShoes,
    ...appliances, ...skincare, ...makeup,
    ...sportsEquip, ...techBooks, ...selfHelpBooks,
    ...bags, ...watches,
  ]

  console.log(`\n✅ Generated ${allProducts.length} products`)

  const categories = makeCategories()
  const users      = makeUsers()
  const orders     = makeOrders(allProducts)
  const coupons    = makeCoupons()
  const banners    = makeBanners()

  fs.writeFileSync(path.join(dataDir, 'products.json'),   JSON.stringify(allProducts, null, 2))
  fs.writeFileSync(path.join(dataDir, 'categories.json'), JSON.stringify(categories,  null, 2))
  fs.writeFileSync(path.join(dataDir, 'users.json'),      JSON.stringify(users,       null, 2))
  fs.writeFileSync(path.join(dataDir, 'orders.json'),     JSON.stringify(orders,      null, 2))
  fs.writeFileSync(path.join(dataDir, 'coupons.json'),    JSON.stringify(coupons,     null, 2))
  fs.writeFileSync(path.join(dataDir, 'banners.json'),    JSON.stringify(banners,     null, 2))

  console.log('\n📁 Files written:')
  console.log(`  ✅ data/products.json   — ${allProducts.length} products`)
  console.log(`  ✅ data/categories.json — ${categories.length} categories`)
  console.log(`  ✅ data/users.json      — ${users.length} users`)
  console.log(`  ✅ data/orders.json     — ${orders.length} orders`)
  console.log(`  ✅ data/coupons.json    — ${coupons.length} coupons`)
  console.log(`  ✅ data/banners.json    — ${banners.length} banners`)
  console.log('\n🎉 Data generation complete! Run: npm run start:dev')
}

main().catch(console.error)
