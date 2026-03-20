/**
 * seed-categories.ts
 *
 * Seeds the categories collection from amazon_categories.csv.
 * Produces a parent → child hierarchy that matches the Category schema exactly.
 *
 * Schema fields: id, name, slug, parentId, level, image, icon,
 *                description, productCount, isActive, isFeatured, sortOrder, filters
 *
 * Run FIRST before importing products:
 *   npx ts-node scripts/seed-categories.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import mongoose from 'mongoose'
import slugify from 'slugify'

const CATEGORIES_CSV = process.env.AMAZON_CATEGORIES_CSV
  || 'C:/Users/Waseem Computer Nwl/Downloads/amazon_categories.csv'
const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) { console.error('Missing MONGODB_URI'); process.exit(1) }
if (!fs.existsSync(CATEGORIES_CSV)) {
  console.error(`CSV not found: ${CATEGORIES_CSV}`)
  process.exit(1)
}

const CategorySchema = new mongoose.Schema({}, { strict: false, timestamps: true })
const Category = mongoose.models.Category
  ?? mongoose.model('Category', CategorySchema, 'categories')

// ─── Parent category definitions ──────────────────────────────────────────────
// These are the top-level nav categories. Icon names match Lucide React icons.

interface ParentDef {
  id: string
  name: string
  slug: string
  icon: string
  description: string
  isFeatured: boolean
  sortOrder: number
}

const PARENTS: ParentDef[] = [
  { id: 'cat_electronics',     name: 'Electronics',               slug: 'electronics',           icon: 'Laptop',       description: 'Latest gadgets, laptops, phones and audio.',          isFeatured: true,  sortOrder: 1 },
  { id: 'cat_fashion',         name: 'Fashion',                   slug: 'fashion',               icon: 'Shirt',        description: 'Clothing, shoes and accessories.',                    isFeatured: true,  sortOrder: 2 },
  { id: 'cat_home_kitchen',    name: 'Home & Kitchen',            slug: 'home-kitchen',          icon: 'Home',         description: 'Furniture, appliances and home decor.',               isFeatured: true,  sortOrder: 3 },
  { id: 'cat_beauty',          name: 'Beauty & Personal Care',    slug: 'beauty',                icon: 'Sparkles',     description: 'Skincare, makeup, hair and personal care.',           isFeatured: true,  sortOrder: 4 },
  { id: 'cat_sports',          name: 'Sports & Outdoors',         slug: 'sports-outdoors',       icon: 'Dumbbell',     description: 'Fitness equipment, outdoor gear and sports.',         isFeatured: true,  sortOrder: 5 },
  { id: 'cat_toys',            name: 'Toys & Games',              slug: 'toys-games',            icon: 'Gamepad2',     description: 'Toys, games and kids entertainment.',                 isFeatured: true,  sortOrder: 6 },
  { id: 'cat_health',          name: 'Health & Household',        slug: 'health',                icon: 'Heart',        description: 'Vitamins, health products and household supplies.',   isFeatured: true,  sortOrder: 7 },
  { id: 'cat_automotive',      name: 'Automotive',                slug: 'automotive',            icon: 'Car',          description: 'Car parts, accessories and tools.',                   isFeatured: false, sortOrder: 8 },
  { id: 'cat_baby',            name: 'Baby',                      slug: 'baby',                  icon: 'Baby',         description: 'Baby products, clothing and toys.',                   isFeatured: false, sortOrder: 9 },
  { id: 'cat_video_games',     name: 'Video Games',               slug: 'video-games',           icon: 'Gamepad',      description: 'Consoles, games and gaming accessories.',             isFeatured: true,  sortOrder: 10 },
  { id: 'cat_luggage',         name: 'Luggage & Travel',          slug: 'luggage-travel',        icon: 'Luggage',      description: 'Luggage, bags and travel accessories.',               isFeatured: false, sortOrder: 11 },
  { id: 'cat_tools',           name: 'Tools & Home Improvement',  slug: 'tools-home-improvement', icon: 'Wrench',      description: 'Power tools, hardware and home improvement.',         isFeatured: false, sortOrder: 12 },
  { id: 'cat_pet',             name: 'Pet Supplies',              slug: 'pet-supplies',          icon: 'PawPrint',     description: 'Food, toys and supplies for your pets.',              isFeatured: false, sortOrder: 13 },
  { id: 'cat_smart_home',      name: 'Smart Home',                slug: 'smart-home',            icon: 'Wifi',         description: 'Smart devices, lighting and home automation.',        isFeatured: false, sortOrder: 14 },
  { id: 'cat_arts_crafts',     name: 'Arts & Crafts',             slug: 'arts-crafts',           icon: 'Palette',      description: 'Craft supplies, art materials and DIY kits.',         isFeatured: false, sortOrder: 15 },
  { id: 'cat_industrial',      name: 'Industrial & Scientific',   slug: 'industrial',            icon: 'Factory',      description: 'Industrial tools, lab supplies and equipment.',       isFeatured: false, sortOrder: 16 },
]

// Maps amazon category_id → parent slug
const CATEGORY_ID_TO_PARENT: Record<string, string> = {
  // Arts & Crafts
  '1':'arts-crafts','2':'arts-crafts','3':'arts-crafts','4':'arts-crafts','5':'arts-crafts',
  '6':'arts-crafts','7':'arts-crafts','8':'arts-crafts','9':'arts-crafts','10':'arts-crafts',
  '11':'arts-crafts','12':'arts-crafts','13':'arts-crafts','216':'arts-crafts','219':'arts-crafts',
  // Automotive
  '14':'automotive','15':'automotive','16':'automotive','17':'automotive','18':'automotive',
  '19':'automotive','20':'automotive','21':'automotive','22':'automotive','23':'automotive',
  '24':'automotive','25':'automotive','26':'automotive','27':'automotive','28':'automotive',
  // Baby
  '29':'baby','30':'baby','31':'baby','32':'baby','33':'baby','34':'baby','35':'baby',
  '36':'baby','38':'baby','39':'baby','40':'baby','41':'baby','42':'baby','43':'baby',
  '44':'baby','264':'baby',
  // Beauty
  '45':'beauty','46':'beauty','47':'beauty','48':'beauty','49':'beauty',
  '50':'beauty','51':'beauty','52':'beauty','53':'beauty',
  // Electronics
  '54':'electronics','55':'electronics','56':'electronics','57':'electronics','60':'electronics',
  '63':'electronics','64':'electronics','65':'electronics','66':'electronics','68':'electronics',
  '69':'electronics','70':'electronics','71':'electronics','72':'electronics','73':'electronics',
  '74':'electronics','75':'electronics','76':'electronics','77':'electronics','78':'electronics',
  '79':'electronics','80':'electronics','81':'electronics','82':'electronics',
  // Video Games
  '83':'video-games','241':'video-games','242':'video-games','243':'video-games','244':'video-games',
  '245':'video-games','248':'video-games','249':'video-games','250':'video-games','251':'video-games',
  '252':'video-games','253':'video-games','254':'video-games','255':'video-games','256':'video-games',
  '259':'video-games','260':'video-games','261':'video-games','262':'video-games','263':'video-games',
  // Fashion
  '84':'fashion','87':'fashion','88':'fashion','89':'fashion','90':'fashion',
  '91':'fashion','94':'fashion','95':'fashion','96':'fashion','97':'fashion',
  '98':'fashion','110':'fashion','112':'fashion','113':'fashion','114':'fashion',
  '116':'fashion','118':'fashion','120':'fashion','121':'fashion','122':'fashion',
  '123':'fashion','265':'fashion',
  // Luggage
  '99':'luggage-travel','100':'luggage-travel','101':'luggage-travel','102':'luggage-travel',
  '103':'luggage-travel','104':'luggage-travel','105':'luggage-travel','106':'luggage-travel',
  '107':'luggage-travel','108':'luggage-travel','109':'luggage-travel',
  // Health
  '126':'health','127':'health','128':'health','129':'health','130':'health',
  '131':'health','132':'health','133':'health','134':'health','135':'health','136':'health',
  // Home & Kitchen
  '163':'home-kitchen','164':'home-kitchen','165':'home-kitchen','166':'home-kitchen',
  '167':'home-kitchen','168':'home-kitchen','169':'home-kitchen','170':'home-kitchen',
  '171':'home-kitchen','172':'home-kitchen','173':'home-kitchen','174':'home-kitchen',
  '175':'home-kitchen','176':'home-kitchen','177':'home-kitchen','201':'home-kitchen','124':'home-kitchen',
  // Pets
  '178':'pet-supplies','179':'pet-supplies','180':'pet-supplies','181':'pet-supplies',
  '182':'pet-supplies','183':'pet-supplies','184':'pet-supplies',
  // Smart Home
  '185':'smart-home','186':'smart-home','187':'smart-home','188':'smart-home','189':'smart-home',
  '190':'smart-home','191':'smart-home','192':'smart-home','193':'smart-home','194':'smart-home',
  '195':'smart-home','196':'smart-home','197':'smart-home',
  // Sports
  '198':'sports-outdoors','199':'sports-outdoors','200':'sports-outdoors',
  // Tools
  '203':'tools-home-improvement','204':'tools-home-improvement','205':'tools-home-improvement',
  '206':'tools-home-improvement','207':'tools-home-improvement','208':'tools-home-improvement',
  '209':'tools-home-improvement','210':'tools-home-improvement','211':'tools-home-improvement',
  '212':'tools-home-improvement','213':'tools-home-improvement','214':'tools-home-improvement',
  '215':'tools-home-improvement',
  // Toys
  '217':'toys-games','218':'toys-games','220':'toys-games','221':'toys-games','222':'toys-games',
  '223':'toys-games','224':'toys-games','225':'toys-games','226':'toys-games','227':'toys-games',
  '228':'toys-games','229':'toys-games','230':'toys-games','231':'toys-games','232':'toys-games',
  '233':'toys-games','234':'toys-games','235':'toys-games','236':'toys-games','237':'toys-games',
  '238':'toys-games','239':'toys-games','240':'toys-games','270':'toys-games',
  // Industrial
  '138':'industrial','139':'industrial','140':'industrial','141':'industrial','142':'industrial',
  '143':'industrial','144':'industrial','145':'industrial','146':'industrial','147':'industrial',
  '148':'industrial','149':'industrial','150':'industrial','151':'industrial','152':'industrial',
  '153':'industrial','154':'industrial','155':'industrial','156':'industrial','157':'industrial',
  '158':'industrial','159':'industrial','160':'industrial','161':'industrial','162':'industrial',
}

const STANDARD_FILTERS = [
  { key: 'brand',    label: 'Brand',       type: 'checkbox' },
  { key: 'price',    label: 'Price Range', type: 'range' },
  { key: 'rating',   label: 'Rating',      type: 'rating' },
  { key: 'inStock',  label: 'Availability', type: 'boolean' },
]

async function main() {
  console.log('🔗  Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connected\n')

  await (Category as any).deleteMany({})
  console.log('🗑️   Cleared existing categories\n')

  // Parse CSV
  const lines = fs.readFileSync(CATEGORIES_CSV, 'utf-8').split('\n').filter(Boolean)
  // id,category_name  (header on line 0)
  const csvMap: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const comma = lines[i].indexOf(',')
    if (comma === -1) continue
    const id   = lines[i].slice(0, comma).trim()
    const name = lines[i].slice(comma + 1).replace(/^"|"$/g, '').trim()
    if (id && name) csvMap[id] = name
  }

  const docs: any[] = []

  // 1. Parent categories (level 0)
  for (const parent of PARENTS) {
    docs.push({
      id:           parent.id,
      name:         parent.name,
      slug:         parent.slug,
      parentId:     null,
      level:        0,
      image:        null,
      icon:         parent.icon,
      description:  parent.description,
      productCount: 0,
      isActive:     true,
      isFeatured:   parent.isFeatured,
      sortOrder:    parent.sortOrder,
      filters:      STANDARD_FILTERS,
    })
  }

  // 2. Subcategories (level 1) — one per CSV row that maps to a parent
  const parentBySlug = Object.fromEntries(PARENTS.map((p) => [p.slug, p.id]))
  let subOrder = 1

  for (const [csvId, categoryName] of Object.entries(csvMap)) {
    const parentSlug = CATEGORY_ID_TO_PARENT[csvId]
    if (!parentSlug) continue

    const parentId = parentBySlug[parentSlug]
    if (!parentId) continue

    const subSlug = slugify(categoryName, { lower: true, strict: true })

    docs.push({
      id:           `cat_sub_${csvId}`,
      name:         categoryName,
      slug:         subSlug,
      parentId:     parentId,
      level:        1,
      image:        null,
      icon:         null,
      description:  `Shop ${categoryName}`,
      productCount: 0,
      isActive:     true,
      isFeatured:   false,
      sortOrder:    subOrder++,
      filters:      STANDARD_FILTERS,
    })
  }

  await (Category as any).insertMany(docs, { ordered: false })

  const parentCount = PARENTS.length
  const subCount    = docs.length - parentCount
  console.log(`✅  Seeded ${parentCount} parent categories + ${subCount} subcategories`)
  console.log(`   Total: ${docs.length} category documents\n`)
  console.log(`📌  Next: import products`)
  console.log(`   npx ts-node scripts/import-amazon.ts\n`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('\n❌  Failed:', err.message)
  process.exit(1)
})
