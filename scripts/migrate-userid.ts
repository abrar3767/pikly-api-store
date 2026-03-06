/**
 * Migration: Convert string userIds to MongoDB ObjectId references
 *
 * SCH-02 fix: The original Cart and Order schemas stored userId as a plain
 * string. The updated schemas use a proper ObjectId reference to the User
 * collection, which enables Mongoose populate(), enforces referential
 * integrity, and prevents orphaned documents from silent accumulation.
 *
 * This script is safe to run multiple times. It checks whether each userId
 * is already a valid ObjectId (24-character hex string) before attempting
 * conversion, so re-running it on an already-migrated database is a no-op.
 *
 * How to run:
 *   MONGODB_URI=mongodb+srv://... npx ts-node scripts/migrate-userid.ts
 */
import * as dotenv from 'dotenv'
dotenv.config()

import * as mongoose from 'mongoose'

const isObjectId = (v: any) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v)

async function migrate() {
  const uri = process.env.MONGODB_URI
  if (!uri) { console.error('MONGODB_URI is required'); process.exit(1) }

  console.log('Connecting to MongoDB...')
  // Use the connection object returned by connect() directly.
  // mongoose.connection.db can be undefined at the moment the promise resolves
  // in some Mongoose versions — conn.connection.db is always populated.
  const conn = await mongoose.connect(uri)
  const db = conn.connection.db!

  // ── Orders ───────────────────────────────────────────────────────────────
  const orders = db.collection('orders')
  const ordersToMigrate = await orders.find({ userId: { $type: 'string' } }).toArray()
  console.log(`Found ${ordersToMigrate.length} order(s) with string userId`)

  let ordersFixed = 0
  for (const order of ordersToMigrate) {
    if (!isObjectId(order.userId)) {
      console.warn(`  Skipping order ${order.orderId} — userId "${order.userId}" is not a valid ObjectId hex string`)
      continue
    }
    await orders.updateOne(
      { _id: order._id },
      { $set: { userId: new mongoose.Types.ObjectId(order.userId) } }
    )
    ordersFixed++
  }
  console.log(`  Migrated ${ordersFixed} order(s)`)

  // ── Carts ────────────────────────────────────────────────────────────────
  const carts = db.collection('carts')
  const cartsToMigrate = await carts.find({ userId: { $type: 'string' } }).toArray()
  console.log(`Found ${cartsToMigrate.length} cart(s) with string userId`)

  let cartsFixed = 0
  for (const cart of cartsToMigrate) {
    if (!isObjectId(cart.userId)) {
      console.warn(`  Skipping cart ${cart.sessionId} — userId "${cart.userId}" is not a valid ObjectId hex string`)
      continue
    }
    await carts.updateOne(
      { _id: cart._id },
      { $set: { userId: new mongoose.Types.ObjectId(cart.userId) } }
    )
    cartsFixed++
  }
  console.log(`  Migrated ${cartsFixed} cart(s)`)

  // ── Coupon expiresAt: string → Date (SCH-03) ─────────────────────────────
  const coupons = db.collection('coupons')
  const couponsToMigrate = await coupons.find({ expiresAt: { $type: 'string' } }).toArray()
  console.log(`Found ${couponsToMigrate.length} coupon(s) with string expiresAt`)

  let couponsFixed = 0
  for (const coupon of couponsToMigrate) {
    const d = new Date(coupon.expiresAt)
    if (isNaN(d.getTime())) {
      console.warn(`  Skipping coupon ${coupon.code} — expiresAt "${coupon.expiresAt}" is not a valid date`)
      continue
    }
    await coupons.updateOne({ _id: coupon._id }, { $set: { expiresAt: d } })
    couponsFixed++
  }
  console.log(`  Migrated ${couponsFixed} coupon(s)`)

  await mongoose.disconnect()
  console.log('\n✅ Migration complete')
}

migrate().catch(err => { console.error(err); process.exit(1) })
