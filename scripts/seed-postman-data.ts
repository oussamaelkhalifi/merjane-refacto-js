/**
 * Seed script to create test data for Postman collection
 *
 * Run with: pnpm tsx scripts/seed-postman-data.ts
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../src/db/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

async function seed() {
  const sqlite = new Database('./database.db');
  const db = drizzle(sqlite, { schema });

  console.log('🌱 Seeding database for Postman tests...\n');

  // Clear existing data (wrapped in try-catch for fresh databases)
  try {
    sqlite.exec('DELETE FROM orders_to_products');
    sqlite.exec('DELETE FROM orders');
    sqlite.exec('DELETE FROM products');
  } catch {
    // Tables might not exist yet, that's fine
  }

  // Reset auto-increment (only if sqlite_sequence exists)
  try {
    sqlite.exec("DELETE FROM sqlite_sequence WHERE name='products'");
    sqlite.exec("DELETE FROM sqlite_sequence WHERE name='orders'");
  } catch {
    // sqlite_sequence doesn't exist on fresh databases
  }

  // ========== CREATE PRODUCTS ==========
  const products = await db
    .insert(schema.products)
    .values([
      // 1: NORMAL available > 0 (decrement stock)
      {
        leadTime: 15,
        available: 10,
        type: schema.PRODUCT_TYPE.NORMAL,
        name: 'USB Cable',
      },
      // 2: NORMAL out of stock with leadTime (delay notification)
      {
        leadTime: 10,
        available: 0,
        type: schema.PRODUCT_TYPE.NORMAL,
        name: 'USB Dongle',
      },
      // 3: NORMAL discontinued (no action)
      {
        leadTime: 0,
        available: 0,
        type: schema.PRODUCT_TYPE.NORMAL,
        name: 'Discontinued Adapter',
      },
      // 4: EXPIRABLE available, not expired (decrement stock)
      {
        leadTime: 15,
        available: 30,
        type: schema.PRODUCT_TYPE.EXPIRABLE,
        name: 'Butter',
        expiryDate: new Date(Date.now() + 26 * DAY_MS),
      },
      // 5: EXPIRABLE expired (expiration notification)
      {
        leadTime: 90,
        available: 6,
        type: schema.PRODUCT_TYPE.EXPIRABLE,
        name: 'Milk',
        expiryDate: new Date(Date.now() - 2 * DAY_MS),
      },
      // 6: EXPIRABLE unavailable, not expired
      {
        leadTime: 15,
        available: 0,
        type: schema.PRODUCT_TYPE.EXPIRABLE,
        name: 'Yogurt',
        expiryDate: new Date(Date.now() + 10 * DAY_MS),
      },
      // 7: SEASONAL in season, available (decrement stock)
      {
        leadTime: 15,
        available: 30,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Watermelon',
        seasonStartDate: new Date(Date.now() - 2 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 58 * DAY_MS),
      },
      // 8: SEASONAL in season, restock in time (delay notification)
      {
        leadTime: 5,
        available: 0,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Cherries',
        seasonStartDate: new Date(Date.now() - 10 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 30 * DAY_MS),
      },
      // 9: SEASONAL in season, restock too late (out of stock)
      {
        leadTime: 60,
        available: 0,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Strawberries',
        seasonStartDate: new Date(Date.now() - 10 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 20 * DAY_MS),
      },
      // 10: SEASONAL season not started
      {
        leadTime: 15,
        available: 30,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Grapes',
        seasonStartDate: new Date(Date.now() + 180 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 240 * DAY_MS),
      },
      // 11: SEASONAL season ended
      {
        leadTime: 15,
        available: 10,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Pumpkin',
        seasonStartDate: new Date(Date.now() - 60 * DAY_MS),
        seasonEndDate: new Date(Date.now() - 5 * DAY_MS),
      },
      // 12-14: Products for multiple products order (order 13)
      {
        leadTime: 15,
        available: 20,
        type: schema.PRODUCT_TYPE.NORMAL,
        name: 'HDMI Cable',
      },
      {
        leadTime: 15,
        available: 15,
        type: schema.PRODUCT_TYPE.EXPIRABLE,
        name: 'Cheese',
        expiryDate: new Date(Date.now() + 30 * DAY_MS),
      },
      {
        leadTime: 10,
        available: 25,
        type: schema.PRODUCT_TYPE.SEASONAL,
        name: 'Peaches',
        seasonStartDate: new Date(Date.now() - 5 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 60 * DAY_MS),
      },
    ])
    .returning({ id: schema.products.id });

  console.log(`✅ Created ${products.length} products`);

  // ========== CREATE ORDERS ==========
  // Orders 1-11: One product each for individual test cases
  // Order 12: Empty order (no products)
  // Order 13: Multiple products of mixed types
  const orders = await db
    .insert(schema.orders)
    .values([
      {}, // Order 1
      {}, // Order 2
      {}, // Order 3
      {}, // Order 4
      {}, // Order 5
      {}, // Order 6
      {}, // Order 7
      {}, // Order 8
      {}, // Order 9
      {}, // Order 10
      {}, // Order 11
      {}, // Order 12 (empty)
      {}, // Order 13 (multiple products)
    ])
    .returning({ id: schema.orders.id });

  console.log(`✅ Created ${orders.length} orders`);

  // ========== LINK ORDERS TO PRODUCTS ==========
  const orderProductLinks = [
    // Orders 1-11: Each linked to corresponding product
    { orderId: 1, productId: 1 },
    { orderId: 2, productId: 2 },
    { orderId: 3, productId: 3 },
    { orderId: 4, productId: 4 },
    { orderId: 5, productId: 5 },
    { orderId: 6, productId: 6 },
    { orderId: 7, productId: 7 },
    { orderId: 8, productId: 8 },
    { orderId: 9, productId: 9 },
    { orderId: 10, productId: 10 },
    { orderId: 11, productId: 11 },
    // Order 12: No products (empty)
    // Order 13: Multiple products (mixed types)
    { orderId: 13, productId: 12 },
    { orderId: 13, productId: 13 },
    { orderId: 13, productId: 14 },
  ];

  await db.insert(schema.ordersToProducts).values(orderProductLinks);

  console.log(`✅ Created ${orderProductLinks.length} order-product links`);

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📋 Test data summary:');
  console.log('   Orders 1-11: Individual test cases (one product each)');
  console.log('   Order 12: Empty order (no products)');
  console.log('   Order 13: Multiple products (HDMI Cable, Cheese, Peaches)');
  console.log('\n🚀 Start the server with: pnpm dev');
  console.log('📮 Import postman/merjane-refacto-collection.json into Postman');

  sqlite.close();
}

seed().catch(console.error);
