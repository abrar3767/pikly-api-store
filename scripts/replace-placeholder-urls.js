const fs = require('fs')
const path = require('path')

const UNSPLASH_BASE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30'
const UNSPLASH_IMG = UNSPLASH_BASE + '?w=400&h=400&fit=crop&auto=format'
const u = (w) => UNSPLASH_BASE + '?w=' + w + '&h=' + w + '&fit=crop&auto=format'

function replacePlaceholders(s) {
  s = s.replace(/https:\/\/via\.placeholder\.com\/200x200\?text=[^"]+/g, u(200))
  s = s.replace(/https:\/\/via\.placeholder\.com\/400x400\?text=[^"]+/g, u(400))
  s = s.replace(/https:\/\/via\.placeholder\.com\/1080x1080\?text=[^"]+/g, u(1080))
  s = s.replace(/https:\/\/via\.placeholder\.com\/2000x2000\?text=[^"]+/g, u(2000))
  s = s.replace(/https:\/\/via\.placeholder\.com\/4000x4000\?text=[^"]+/g, u(4000))
  return s
}

function replaceApiUnsplash(s) {
  return s.replace(/https:\/\/api\.unsplash\.com\/photos\/random\?[^"]+/g, UNSPLASH_IMG)
}

function replaceInFile(filePath, options = {}) {
  let s = fs.readFileSync(filePath, 'utf8')
  const placeholdersBefore = (s.match(/via\.placeholder\.com/g) || []).length
  const apiBefore = (s.match(/api\.unsplash\.com/g) || []).length
  if (options.placeholders !== false) s = replacePlaceholders(s)
  if (options.apiUnsplash) s = replaceApiUnsplash(s)
  fs.writeFileSync(filePath, s)
  console.log(path.basename(filePath) + ': placeholders replaced ' + placeholdersBefore + ', api.unsplash replaced ' + apiBefore)
}

const dataDir = path.join(__dirname, '..', 'data')
replaceInFile(path.join(dataDir, 'products.json'))
replaceInFile(path.join(dataDir, 'orders.json'))
replaceInFile(path.join(dataDir, 'categories.json'), { placeholders: false, apiUnsplash: true })
replaceInFile(path.join(dataDir, 'users.json'), { placeholders: false, apiUnsplash: true })
replaceInFile(path.join(dataDir, 'banners.json'), { placeholders: false, apiUnsplash: true })
