/**
 * category-attribute-map.ts
 *
 * Maps every Amazon category_id to:
 *   - parent:      top-level category slug (used as `category` in product schema)
 *   - sub:         subcategory slug
 *   - attributes:  function that returns realistic Faker-generated attributes
 *                  specific to that category group
 *
 * Why Faker for attributes?
 * The Amazon dataset has no attribute columns. Rather than leaving attributes
 * empty (which breaks faceted filtering), we generate category-appropriate
 * attributes — the same strategy real catalogues use when ingesting raw feeds.
 */

import { faker } from '@faker-js/faker'

export interface CategoryMeta {
  parent: string        // e.g. "electronics"
  parentLabel: string   // e.g. "Electronics"
  sub: string           // e.g. "laptops"
  subLabel: string      // e.g. "Laptops"
  attributes: () => Record<string, string>
  colors: string[]
  sizes: string[]
}

// ── Shared value pools ────────────────────────────────────────────────────────

const COLORS_FASHION   = ['Black', 'White', 'Navy', 'Gray', 'Red', 'Blue', 'Green', 'Pink', 'Brown', 'Beige', 'Purple', 'Orange']
const COLORS_TECH      = ['Black', 'Silver', 'White', 'Space Gray', 'Gold', 'Midnight', 'Starlight']
const COLORS_GENERIC   = ['Black', 'White', 'Gray', 'Blue', 'Red', 'Green', 'Brown', 'Beige']
const SIZES_CLOTHING   = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
const SIZES_SHOES      = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12']
const SIZES_LUGGAGE    = ['20"', '24"', '28"', 'Carry-On', 'Medium', 'Large']
const NO_SIZES: string[] = []

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const pickN = <T>(arr: T[], n: number): T[] => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

// ── Attribute generators per category group ───────────────────────────────────

const attrs = {
  laptop: () => ({
    brand:       pick(['Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'Apple', 'MSI', 'Razer']),
    processor:   pick(['Intel Core i5', 'Intel Core i7', 'Intel Core i9', 'AMD Ryzen 5', 'AMD Ryzen 7', 'Apple M2', 'Apple M3']),
    ram:         pick(['8GB', '16GB', '32GB', '64GB']),
    storage:     pick(['256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD']),
    screenSize:  pick(['13.3"', '14"', '15.6"', '16"', '17.3"']),
    gpu:         pick(['Integrated', 'NVIDIA RTX 3060', 'NVIDIA RTX 4070', 'AMD Radeon RX 6700M']),
    os:          pick(['Windows 11', 'macOS', 'Chrome OS', 'Linux']),
    batteryLife: pick(['6 hrs', '8 hrs', '10 hrs', '12 hrs', '15 hrs']),
  }),
  phone: () => ({
    brand:       pick(['Apple', 'Samsung', 'Google', 'OnePlus', 'Motorola', 'Sony']),
    storage:     pick(['64GB', '128GB', '256GB', '512GB']),
    ram:         pick(['4GB', '6GB', '8GB', '12GB']),
    screenSize:  pick(['5.4"', '6.1"', '6.4"', '6.7"', '6.8"']),
    battery:     pick(['3000mAh', '4000mAh', '4500mAh', '5000mAh']),
    camera:      pick(['12MP', '48MP', '50MP', '108MP', '200MP']),
    os:          pick(['iOS 17', 'Android 13', 'Android 14']),
    connectivity: pick(['5G', '4G LTE', '5G mmWave']),
  }),
  tv: () => ({
    brand:       pick(['Samsung', 'LG', 'Sony', 'TCL', 'Hisense', 'Vizio']),
    screenSize:  pick(['43"', '50"', '55"', '65"', '75"', '85"']),
    resolution:  pick(['1080p FHD', '4K UHD', '8K UHD']),
    displayType: pick(['LED', 'QLED', 'OLED', 'Mini-LED', 'NanoCell']),
    refreshRate: pick(['60Hz', '120Hz', '144Hz']),
    smartTV:     pick(['Yes', 'No']),
    hdr:         pick(['HDR10', 'Dolby Vision', 'HDR10+', 'None']),
  }),
  headphones: () => ({
    brand:       pick(['Sony', 'Bose', 'Apple', 'Sennheiser', 'JBL', 'Beats', 'Audio-Technica']),
    type:        pick(['Over-Ear', 'On-Ear', 'In-Ear', 'True Wireless']),
    connectivity: pick(['Wired', 'Bluetooth 5.0', 'Bluetooth 5.3', 'Wireless + Wired']),
    noiseCancelling: pick(['Active', 'Passive', 'None']),
    batteryLife: pick(['20 hrs', '30 hrs', '40 hrs', 'N/A']),
    driver:      pick(['40mm', '30mm', '10mm', '11mm']),
  }),
  camera: () => ({
    brand:       pick(['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'GoPro']),
    type:        pick(['DSLR', 'Mirrorless', 'Point & Shoot', 'Action', 'Instant']),
    megapixels:  pick(['12MP', '20MP', '24MP', '33MP', '45MP', '61MP']),
    sensor:      pick(['Full Frame', 'APS-C', 'Micro Four Thirds', '1-inch']),
    video:       pick(['1080p', '4K 30fps', '4K 60fps', '8K']),
    stabilization: pick(['Optical', 'Digital', 'In-Body', 'None']),
  }),
  clothing: () => ({
    brand:       pick(['Nike', 'Adidas', 'Levi\'s', 'H&M', 'Zara', 'Gap', 'Under Armour', 'Ralph Lauren']),
    material:    pick(['Cotton', '100% Cotton', 'Polyester', 'Cotton Blend', 'Linen', 'Wool', 'Denim', 'Fleece']),
    fit:         pick(['Regular', 'Slim', 'Relaxed', 'Athletic', 'Oversized']),
    care:        pick(['Machine Wash', 'Hand Wash Only', 'Dry Clean Only']),
    origin:      pick(['USA', 'Bangladesh', 'Vietnam', 'China', 'India', 'Portugal']),
  }),
  shoes: () => ({
    brand:       pick(['Nike', 'Adidas', 'New Balance', 'Puma', 'Reebok', 'Vans', 'Converse', 'Dr. Martens']),
    material:    pick(['Leather', 'Synthetic', 'Canvas', 'Mesh', 'Suede']),
    sole:        pick(['Rubber', 'EVA', 'TPU', 'Leather']),
    closure:     pick(['Lace-up', 'Slip-on', 'Velcro', 'Buckle']),
    width:       pick(['Narrow', 'Regular', 'Wide', 'Extra Wide']),
  }),
  luggage: () => ({
    brand:       pick(['Samsonite', 'Travelpro', 'Rimowa', 'Tumi', 'American Tourister', 'Delsey']),
    material:    pick(['Hardshell Polycarbonate', 'Softside Nylon', 'ABS', 'Aluminum']),
    wheels:      pick(['2-Wheel', '4-Wheel Spinner', '8-Wheel Spinner']),
    lock:        pick(['TSA Lock', 'Combination Lock', 'No Lock']),
    capacity:    pick(['30L', '50L', '70L', '90L', '110L']),
    weight:      `${(faker.number.float({ min: 2.5, max: 6.5, fractionDigits: 1 }))}kg`,
  }),
  beauty: () => ({
    brand:       pick(['L\'Oreal', 'Neutrogena', 'Maybelline', 'CeraVe', 'The Ordinary', 'Olay', 'Cetaphil', 'MAC']),
    skinType:    pick(['All Skin Types', 'Oily', 'Dry', 'Combination', 'Sensitive', 'Normal']),
    volume:      pick(['30ml', '50ml', '100ml', '150ml', '200ml', '250ml']),
    finish:      pick(['Matte', 'Dewy', 'Natural', 'Satin', 'Glossy']),
    spf:         pick(['None', 'SPF 15', 'SPF 30', 'SPF 50']),
    crueltyFree: pick(['Yes', 'No']),
    vegan:       pick(['Yes', 'No']),
  }),
  haircare: () => ({
    brand:       pick(['Pantene', 'Head & Shoulders', 'OGX', 'TRESemmé', 'Dove', 'Redken', 'Moroccanoil']),
    hairType:    pick(['All Hair Types', 'Dry & Damaged', 'Oily', 'Color-Treated', 'Curly', 'Fine & Limp']),
    volume:      pick(['200ml', '355ml', '400ml', '500ml', '750ml']),
    scent:       pick(['Fresh', 'Floral', 'Coconut', 'Argan', 'Unscented', 'Citrus']),
    sulfateFree: pick(['Yes', 'No']),
  }),
  furniture: () => ({
    brand:       pick(['IKEA', 'Ashley', 'Wayfair', 'West Elm', 'Pottery Barn', 'CB2']),
    material:    pick(['Solid Wood', 'MDF', 'Metal', 'Upholstered Fabric', 'Leather', 'Rattan']),
    assembly:    pick(['Required', 'No Assembly Required', 'Partial Assembly']),
    weightLimit: `${faker.number.int({ min: 100, max: 500 })}lbs`,
    dimensions:  `${faker.number.int({ min: 20, max: 80 })}"W x ${faker.number.int({ min: 15, max: 40 })}"D x ${faker.number.int({ min: 18, max: 50 })}"H`,
    style:       pick(['Modern', 'Traditional', 'Mid-Century', 'Industrial', 'Scandinavian', 'Rustic']),
  }),
  kitchen: () => ({
    brand:       pick(['KitchenAid', 'Cuisinart', 'Instant Pot', 'Ninja', 'OXO', 'Lodge', 'Le Creuset']),
    material:    pick(['Stainless Steel', 'Cast Iron', 'Non-Stick', 'Ceramic', 'Silicone', 'BPA-Free Plastic']),
    capacity:    pick(['1L', '2L', '3L', '5L', '6L', '8L']),
    dishwasherSafe: pick(['Yes', 'No']),
    warranty:    pick(['1 Year', '2 Years', '5 Years', 'Lifetime']),
  }),
  sports: () => ({
    brand:       pick(['Nike', 'Adidas', 'Under Armour', 'Wilson', 'Callaway', 'Spalding', 'Yonex']),
    material:    pick(['Polyester', 'Nylon', 'Carbon Fiber', 'Aluminum', 'Rubber', 'Foam']),
    level:       pick(['Beginner', 'Intermediate', 'Advanced', 'Professional']),
    ageGroup:    pick(['Adult', 'Youth', 'Kids', 'All Ages']),
    warranty:    pick(['6 Months', '1 Year', '2 Years']),
  }),
  toys: () => ({
    brand:       pick(['LEGO', 'Mattel', 'Hasbro', 'Fisher-Price', 'Melissa & Doug', 'Play-Doh']),
    ageRange:    pick(['0-2 years', '3-5 years', '6-8 years', '9-12 years', '8+ years', '14+ years']),
    material:    pick(['Plastic', 'Wood', 'Fabric', 'Metal', 'Foam']),
    batteries:   pick(['Included', 'Required (not included)', 'Not Required']),
    safetyRated: pick(['ASTM F963', 'EN71', 'CE Certified']),
  }),
  books: () => ({
    publisher:   pick(['Penguin', 'HarperCollins', 'Random House', 'Simon & Schuster', 'Scholastic', 'Wiley']),
    format:      pick(['Hardcover', 'Paperback', 'Spiral-Bound', 'Board Book']),
    language:    'English',
    pages:       String(faker.number.int({ min: 100, max: 900 })),
    genre:       pick(['Fiction', 'Non-Fiction', 'Self-Help', 'Biography', 'Science', 'History', 'Technology', 'Children']),
  }),
  automotive: () => ({
    brand:       pick(['Bosch', '3M', 'Meguiar\'s', 'WeatherTech', 'Chemical Guys', 'ACDelco']),
    compatibility: pick(['Universal Fit', 'Vehicle Specific', 'Most Makes & Models']),
    material:    pick(['Rubber', 'Plastic', 'Steel', 'Aluminum', 'Microfiber']),
    warranty:    pick(['6 Months', '1 Year', '2 Years', 'Lifetime']),
  }),
  health: () => ({
    brand:       pick(['Nature Made', 'Garden of Life', 'Optimum Nutrition', 'NOW Foods', 'Centrum', 'Vitafusion']),
    form:        pick(['Capsules', 'Tablets', 'Gummies', 'Powder', 'Liquid', 'Softgels']),
    count:       pick(['30 Count', '60 Count', '90 Count', '120 Count', '180 Count', '365 Count']),
    certifications: pick(['GMP Certified', 'USP Verified', 'NSF Certified', 'Organic', 'Non-GMO']),
    servingSize: pick(['1 Capsule', '2 Tablets', '1 Scoop', '2 Gummies']),
  }),
  gaming: () => ({
    brand:       pick(['Sony', 'Microsoft', 'Nintendo', 'Razer', 'Logitech', 'SteelSeries', 'HyperX']),
    platform:    pick(['PlayStation 5', 'Xbox Series X', 'Nintendo Switch', 'PC', 'Multi-Platform']),
    genre:       pick(['Action', 'RPG', 'Sports', 'FPS', 'Strategy', 'Adventure', 'Racing']),
    players:     pick(['Single Player', 'Multiplayer', '1-4 Players', 'Online Multiplayer']),
    rating:      pick(['E (Everyone)', 'E10+', 'T (Teen)', 'M (Mature 17+)']),
  }),
  smartHome: () => ({
    brand:       pick(['Amazon', 'Google', 'Apple', 'Ring', 'Nest', 'Philips Hue', 'TP-Link']),
    connectivity: pick(['WiFi', 'Bluetooth', 'Zigbee', 'Z-Wave', 'Thread']),
    voiceControl: pick(['Alexa', 'Google Assistant', 'Siri', 'Alexa & Google', 'All Three']),
    powerSource:  pick(['AC Powered', 'Battery', 'Hardwired', 'Solar']),
    warranty:     pick(['1 Year', '2 Years', '3 Years']),
  }),
  generic: () => ({
    brand:       pick(['Generic', 'Amazon Basics', 'AmazonCommercial', faker.company.name()]),
    material:    pick(['Plastic', 'Metal', 'Wood', 'Fabric', 'Rubber', 'Glass', 'Ceramic']),
    warranty:    pick(['30 Days', '90 Days', '1 Year', '2 Years']),
    origin:      pick(['USA', 'China', 'Germany', 'Japan', 'India']),
  }),
}

// ── Category ID → CategoryMeta map ────────────────────────────────────────────

export const CATEGORY_MAP: Record<string, CategoryMeta> = {
  // ── Arts & Crafts ──────────────────────────────────────────────────────────
  ...Object.fromEntries([1,2,3,4,5,6,7,8,9,10,11,12,13,216,219].map(id => [String(id), {
    parent: 'arts-crafts', parentLabel: 'Arts & Crafts',
    sub: 'craft-supplies', subLabel: 'Craft Supplies',
    attributes: attrs.generic,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Automotive ────────────────────────────────────────────────────────────
  ...Object.fromEntries([14,15,16,17,18,19,20,21,22,23,24,25,26,27,28].map(id => [String(id), {
    parent: 'automotive', parentLabel: 'Automotive',
    sub: 'auto-parts', subLabel: 'Auto Parts & Accessories',
    attributes: attrs.automotive,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Baby ──────────────────────────────────────────────────────────────────
  ...Object.fromEntries([29,30,31,32,33,34,35,36,38,39,40,41,42,43,44,264].map(id => [String(id), {
    parent: 'baby', parentLabel: 'Baby',
    sub: 'baby-products', subLabel: 'Baby Products',
    attributes: attrs.generic,
    colors: ['Pink', 'Blue', 'White', 'Yellow', 'Green', 'Gray'], sizes: ['0-3M', '3-6M', '6-12M', '12-18M', '18-24M', '2T', '3T'],
  }])),

  // ── Beauty ────────────────────────────────────────────────────────────────
  '45': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'beauty', subLabel: 'Beauty', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '46': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'fragrance', subLabel: 'Perfumes & Fragrances', attributes: attrs.beauty, colors: NO_SIZES as any, sizes: ['30ml', '50ml', '75ml', '100ml'] },
  '47': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'hair-care', subLabel: 'Hair Care', attributes: attrs.haircare, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '48': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'makeup', subLabel: 'Makeup', attributes: attrs.beauty, colors: ['Fair', 'Light', 'Medium', 'Tan', 'Dark', 'Deep'], sizes: NO_SIZES },
  '49': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'skin-care', subLabel: 'Skin Care', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '50': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'beauty-tools', subLabel: 'Beauty Tools', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '51': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'nail-care', subLabel: 'Nail Care', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '52': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'personal-care', subLabel: 'Personal Care', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '53': { parent: 'beauty', parentLabel: 'Beauty & Personal Care', sub: 'shaving', subLabel: 'Shaving & Hair Removal', attributes: attrs.beauty, colors: COLORS_GENERIC, sizes: NO_SIZES },

  // ── Computers & Electronics ───────────────────────────────────────────────
  '54': { parent: 'electronics', parentLabel: 'Electronics', sub: 'servers', subLabel: 'Computer Servers', attributes: attrs.laptop, colors: COLORS_TECH, sizes: NO_SIZES },
  '55': { parent: 'electronics', parentLabel: 'Electronics', sub: 'data-storage', subLabel: 'Data Storage', attributes: attrs.laptop, colors: COLORS_TECH, sizes: ['256GB', '512GB', '1TB', '2TB', '4TB', '8TB'] },
  '56': { parent: 'electronics', parentLabel: 'Electronics', sub: 'monitors', subLabel: 'Computer Monitors', attributes: attrs.tv, colors: COLORS_TECH, sizes: ['21"', '24"', '27"', '32"', '34"', '38"'] },
  '57': { parent: 'electronics', parentLabel: 'Electronics', sub: 'computers-tablets', subLabel: 'Computers & Tablets', attributes: attrs.laptop, colors: COLORS_TECH, sizes: NO_SIZES },
  '60': { parent: 'electronics', parentLabel: 'Electronics', sub: 'networking', subLabel: 'Computer Networking', attributes: attrs.smartHome, colors: COLORS_TECH, sizes: NO_SIZES },
  '63': { parent: 'electronics', parentLabel: 'Electronics', sub: 'components', subLabel: 'Computer Components', attributes: attrs.laptop, colors: COLORS_TECH, sizes: NO_SIZES },
  '64': { parent: 'electronics', parentLabel: 'Electronics', sub: 'tablet-accessories', subLabel: 'Tablet Accessories', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '65': { parent: 'electronics', parentLabel: 'Electronics', sub: 'laptop-accessories', subLabel: 'Laptop Accessories', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '66': { parent: 'electronics', parentLabel: 'Electronics', sub: 'external-components', subLabel: 'External Components', attributes: attrs.laptop, colors: COLORS_TECH, sizes: NO_SIZES },
  '68': { parent: 'electronics', parentLabel: 'Electronics', sub: 'wearables', subLabel: 'Wearable Technology', attributes: attrs.phone, colors: COLORS_TECH, sizes: ['Small', 'Medium', 'Large', 'One Size'] },
  '69': { parent: 'electronics', parentLabel: 'Electronics', sub: 'televisions', subLabel: 'Televisions', attributes: attrs.tv, colors: COLORS_TECH, sizes: ['43"', '50"', '55"', '65"', '75"', '85"'] },
  '70': { parent: 'electronics', parentLabel: 'Electronics', sub: 'gps', subLabel: 'GPS & Navigation', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '71': { parent: 'electronics', parentLabel: 'Electronics', sub: 'headphones', subLabel: 'Headphones & Earbuds', attributes: attrs.headphones, colors: COLORS_TECH, sizes: NO_SIZES },
  '72': { parent: 'electronics', parentLabel: 'Electronics', sub: 'office-electronics', subLabel: 'Office Electronics', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '73': { parent: 'electronics', parentLabel: 'Electronics', sub: 'portable-audio', subLabel: 'Portable Audio & Video', attributes: attrs.headphones, colors: COLORS_TECH, sizes: NO_SIZES },
  '74': { parent: 'electronics', parentLabel: 'Electronics', sub: 'ebook-readers', subLabel: 'eBook Readers', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '75': { parent: 'electronics', parentLabel: 'Electronics', sub: 'cell-phones', subLabel: 'Cell Phones', attributes: attrs.phone, colors: COLORS_TECH, sizes: ['64GB', '128GB', '256GB', '512GB'] },
  '76': { parent: 'electronics', parentLabel: 'Electronics', sub: 'accessories', subLabel: 'Accessories & Supplies', attributes: attrs.generic, colors: COLORS_TECH, sizes: NO_SIZES },
  '77': { parent: 'electronics', parentLabel: 'Electronics', sub: 'projectors', subLabel: 'Video Projectors', attributes: attrs.tv, colors: COLORS_TECH, sizes: NO_SIZES },
  '78': { parent: 'electronics', parentLabel: 'Electronics', sub: 'vehicle-electronics', subLabel: 'Vehicle Electronics', attributes: attrs.automotive, colors: COLORS_TECH, sizes: NO_SIZES },
  '79': { parent: 'electronics', parentLabel: 'Electronics', sub: 'cameras', subLabel: 'Camera & Photo', attributes: attrs.camera, colors: COLORS_TECH, sizes: NO_SIZES },
  '80': { parent: 'electronics', parentLabel: 'Electronics', sub: 'security', subLabel: 'Security & Surveillance', attributes: attrs.smartHome, colors: COLORS_TECH, sizes: NO_SIZES },
  '81': { parent: 'electronics', parentLabel: 'Electronics', sub: 'computers', subLabel: 'Computers', attributes: attrs.laptop, colors: COLORS_TECH, sizes: NO_SIZES },
  '82': { parent: 'electronics', parentLabel: 'Electronics', sub: 'home-audio', subLabel: 'Home Audio & Theater', attributes: attrs.headphones, colors: COLORS_TECH, sizes: NO_SIZES },

  // ── Video Games ───────────────────────────────────────────────────────────
  ...Object.fromEntries([83,241,242,243,244,245,248,249,250,251,252,253,254,255,256,259,260,261,262,263].map(id => [String(id), {
    parent: 'video-games', parentLabel: 'Video Games',
    sub: 'games-consoles', subLabel: 'Games & Consoles',
    attributes: attrs.gaming,
    colors: COLORS_TECH, sizes: NO_SIZES,
  }])),

  // ── Kids Clothing ─────────────────────────────────────────────────────────
  ...Object.fromEntries([84,87,88,89,90,91,94,95,96,97,98,265].map(id => [String(id), {
    parent: 'fashion', parentLabel: 'Fashion',
    sub: 'kids-clothing', subLabel: "Kids' Clothing & Shoes",
    attributes: attrs.clothing,
    colors: COLORS_FASHION, sizes: ['2T', '3T', '4T', '5', '6', '7', '8', '10', '12', '14', '16'],
  }])),

  // ── Luggage & Travel ──────────────────────────────────────────────────────
  ...Object.fromEntries([99,100,101,102,103,104,105,106,107,108,109].map(id => [String(id), {
    parent: 'luggage-travel', parentLabel: 'Luggage & Travel',
    sub: 'luggage', subLabel: 'Luggage & Bags',
    attributes: attrs.luggage,
    colors: COLORS_FASHION, sizes: SIZES_LUGGAGE,
  }])),

  // ── Men's Fashion ─────────────────────────────────────────────────────────
  '110': { parent: 'fashion', parentLabel: 'Fashion', sub: 'mens-clothing', subLabel: "Men's Clothing", attributes: attrs.clothing, colors: COLORS_FASHION, sizes: SIZES_CLOTHING },
  '112': { parent: 'fashion', parentLabel: 'Fashion', sub: 'mens-accessories', subLabel: "Men's Accessories", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },
  '113': { parent: 'fashion', parentLabel: 'Fashion', sub: 'mens-watches', subLabel: "Men's Watches", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },
  '114': { parent: 'fashion', parentLabel: 'Fashion', sub: 'mens-shoes', subLabel: "Men's Shoes", attributes: attrs.shoes, colors: COLORS_FASHION, sizes: SIZES_SHOES },

  // ── Women's Fashion ───────────────────────────────────────────────────────
  '116': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-clothing', subLabel: "Women's Clothing", attributes: attrs.clothing, colors: COLORS_FASHION, sizes: SIZES_CLOTHING },
  '118': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-handbags', subLabel: "Women's Handbags", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },
  '120': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-accessories', subLabel: "Women's Accessories", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },
  '121': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-watches', subLabel: "Women's Watches", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },
  '122': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-shoes', subLabel: "Women's Shoes", attributes: attrs.shoes, colors: COLORS_FASHION, sizes: ['5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '11'] },
  '123': { parent: 'fashion', parentLabel: 'Fashion', sub: 'womens-jewelry', subLabel: "Women's Jewelry", attributes: attrs.generic, colors: COLORS_FASHION, sizes: NO_SIZES },

  // ── Health ────────────────────────────────────────────────────────────────
  ...Object.fromEntries([126,127,128,129,130,131,132,133,134,135,136].map(id => [String(id), {
    parent: 'health', parentLabel: 'Health & Household',
    sub: 'health-products', subLabel: 'Health Products',
    attributes: attrs.health,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Home & Kitchen ────────────────────────────────────────────────────────
  '163': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'bath', subLabel: 'Bath Products', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '164': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'bedding', subLabel: 'Bedding', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: ['Twin', 'Full', 'Queen', 'King', 'Cal King'] },
  '165': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'home-decor', subLabel: 'Home Décor', attributes: attrs.furniture, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '166': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'furniture', subLabel: 'Furniture', attributes: attrs.furniture, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '167': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'cleaning', subLabel: 'Household Cleaning', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: ['250ml', '500ml', '1L', '2L'] },
  '168': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'seasonal-decor', subLabel: 'Seasonal Décor', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '169': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'lighting', subLabel: 'Home Lighting', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '170': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'kitchen-dining', subLabel: 'Kitchen & Dining', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '171': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'hvac', subLabel: 'Heating & Cooling', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '172': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'kids-home', subLabel: "Kids' Home", attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '173': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'storage', subLabel: 'Storage & Organization', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '174': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'wall-art', subLabel: 'Wall Art', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: ['Small', 'Medium', 'Large', 'XL'] },
  '175': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'vacuum-cleaners', subLabel: 'Vacuum Cleaners', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '176': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'ironing', subLabel: 'Ironing Products', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '177': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'party-supplies', subLabel: 'Party Supplies', attributes: attrs.generic, colors: COLORS_GENERIC, sizes: NO_SIZES },
  '201': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'appliances', subLabel: 'Home Appliances', attributes: attrs.kitchen, colors: COLORS_GENERIC, sizes: NO_SIZES },

  // ── Pets ──────────────────────────────────────────────────────────────────
  ...Object.fromEntries([178,179,180,181,182,183,184].map(id => [String(id), {
    parent: 'pet-supplies', parentLabel: 'Pet Supplies',
    sub: 'pet-products', subLabel: 'Pet Products',
    attributes: attrs.generic,
    colors: COLORS_GENERIC, sizes: ['XS', 'S', 'M', 'L', 'XL'],
  }])),

  // ── Smart Home ────────────────────────────────────────────────────────────
  ...Object.fromEntries([185,186,187,188,189,190,191,192,193,194,195,196,197].map(id => [String(id), {
    parent: 'smart-home', parentLabel: 'Smart Home',
    sub: 'smart-devices', subLabel: 'Smart Devices',
    attributes: attrs.smartHome,
    colors: COLORS_TECH, sizes: NO_SIZES,
  }])),

  // ── Sports & Outdoors ─────────────────────────────────────────────────────
  '198': { parent: 'sports-outdoors', parentLabel: 'Sports & Outdoors', sub: 'sports-fitness', subLabel: 'Sports & Fitness', attributes: attrs.sports, colors: COLORS_FASHION, sizes: SIZES_CLOTHING },
  '199': { parent: 'sports-outdoors', parentLabel: 'Sports & Outdoors', sub: 'outdoor-recreation', subLabel: 'Outdoor Recreation', attributes: attrs.sports, colors: COLORS_FASHION, sizes: SIZES_CLOTHING },
  '200': { parent: 'sports-outdoors', parentLabel: 'Sports & Outdoors', sub: 'sports', subLabel: 'Sports', attributes: attrs.sports, colors: COLORS_FASHION, sizes: SIZES_CLOTHING },

  // ── Tools & Home Improvement ──────────────────────────────────────────────
  ...Object.fromEntries([203,204,205,206,207,208,209,210,211,212,213,214,215].map(id => [String(id), {
    parent: 'tools-home-improvement', parentLabel: 'Tools & Home Improvement',
    sub: 'tools', subLabel: 'Tools & Hardware',
    attributes: attrs.automotive,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Toys & Games ──────────────────────────────────────────────────────────
  ...Object.fromEntries([217,218,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,270].map(id => [String(id), {
    parent: 'toys-games', parentLabel: 'Toys & Games',
    sub: 'toys', subLabel: 'Toys & Games',
    attributes: attrs.toys,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Industrial & Scientific ───────────────────────────────────────────────
  ...Object.fromEntries([138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162].map(id => [String(id), {
    parent: 'industrial', parentLabel: 'Industrial & Scientific',
    sub: 'industrial-products', subLabel: 'Industrial Products',
    attributes: attrs.generic,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }])),

  // ── Kids' Furniture ───────────────────────────────────────────────────────
  '124': { parent: 'home-kitchen', parentLabel: 'Home & Kitchen', sub: 'kids-furniture', subLabel: "Kids' Furniture", attributes: attrs.furniture, colors: COLORS_GENERIC, sizes: NO_SIZES },
}

// Fallback for unmapped categories
export function getCategoryMeta(categoryId: string): CategoryMeta {
  return CATEGORY_MAP[categoryId] ?? {
    parent: 'general', parentLabel: 'General',
    sub: 'general', subLabel: 'General',
    attributes: attrs.generic,
    colors: COLORS_GENERIC, sizes: NO_SIZES,
  }
}

export function pickColors(pool: string[], min = 1, max = 4): string[] {
  const n = faker.number.int({ min, max: Math.min(max, pool.length) })
  return pool.length > 0 ? pickN(pool, n) : []
}

export function pickSizes(pool: string[]): string[] {
  if (pool.length === 0) return []
  const n = faker.number.int({ min: 1, max: Math.min(5, pool.length) })
  return pickN(pool, n)
}