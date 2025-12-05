import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { type FastifyInstance } from 'fastify';
import supertest from 'supertest';
import { eq } from 'drizzle-orm';
import { type DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { asValue } from 'awilix';
import { type INotificationService } from '@/services/notifications.port.js';
import {
  type ProductInsert,
  products,
  orders,
  ordersToProducts,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {buildFastify} from '@/fastify.js';
import {PRODUCT_TYPE} from '@/domain/product-type.enum.js';

describe('OrderController Integration Tests', () => {
  let fastify: FastifyInstance;
  let database: Database;
  let notificationServiceMock: DeepMockProxy<INotificationService>;

  beforeEach(async () => {
    notificationServiceMock = mockDeep<INotificationService>();

    fastify = await buildFastify();
    fastify.diContainer.register({
      ns: asValue(notificationServiceMock as INotificationService),
    });
    await fastify.ready();
    database = fastify.database;
  });
  afterEach(async () => {
    await fastify.close();
  });

  it('ProcessOrderShouldReturn', async () => {
    const client = supertest(fastify.server);
    const allProducts = createProducts();
    const orderId = await database.transaction(async (tx) => {
      const productList = await tx
        .insert(products)
        .values(allProducts)
        .returning({ productId: products.id });
      const [order] = await tx
        .insert(orders)
        .values([{}])
        .returning({ orderId: orders.id });
      await tx.insert(ordersToProducts).values(
        productList.map((p) => ({
          orderId: order!.orderId,
          productId: p.productId,
        }))
      );
      return order!.orderId;
    });

    await client
      .post(`/orders/${orderId}/processOrder`)
      .expect(200)
      .expect('Content-Type', /application\/json/);

    const resultOrder = await database.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    expect(resultOrder!.id).toBe(orderId);
  });

  function createProducts(): ProductInsert[] {
    const d = 24 * 60 * 60 * 1000;
    return [
      // ========== NORMAL PRODUCTS ==========
      // Case 1: available > 0 → decrement stock
      {
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.NORMAL,
        name: 'USB Cable',
      },
      // Case 2: available = 0, leadTime > 0 → notify delay
      {
        leadTime: 10,
        available: 0,
        type: PRODUCT_TYPE.NORMAL,
        name: 'USB Dongle',
      },
      // Case 3: available = 0, leadTime = 0 → no action
      {
        leadTime: 0,
        available: 0,
        type: PRODUCT_TYPE.NORMAL,
        name: 'Discontinued Adapter',
      },

      // ========== EXPIRABLE PRODUCTS ==========
      // Case 1: available > 0, not expired → decrement stock
      {
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Butter',
        expiryDate: new Date(Date.now() + 26 * d),
      },
      // Case 2: available > 0, expired → expiration notification + out of stock
      {
        leadTime: 90,
        available: 6,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Milk',
        expiryDate: new Date(Date.now() - 2 * d),
      },
      // Case 3: available = 0, not expired → expiration notification + out of stock
      {
        leadTime: 15,
        available: 0,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Yogurt',
        expiryDate: new Date(Date.now() + 10 * d),
      },

      // ========== SEASONAL PRODUCTS ==========
      // Case 1: in season, available > 0 → decrement stock
      {
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Watermelon',
        seasonStartDate: new Date(Date.now() - 2 * d),
        seasonEndDate: new Date(Date.now() + 58 * d),
      },
      // Case 2: in season, available = 0, restock before season ends → notify delay
      {
        leadTime: 5,
        available: 0,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Cherries',
        seasonStartDate: new Date(Date.now() - 10 * d),
        seasonEndDate: new Date(Date.now() + 30 * d),
      },
      // Case 3: in season, available = 0, restock after season ends → out of stock
      {
        leadTime: 60,
        available: 0,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Strawberries',
        seasonStartDate: new Date(Date.now() - 10 * d),
        seasonEndDate: new Date(Date.now() + 20 * d),
      },
      // Case 4: season not started yet → out of stock notification
      {
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Grapes',
        seasonStartDate: new Date(Date.now() + 180 * d),
        seasonEndDate: new Date(Date.now() + 240 * d),
      },
      // Case 5: season already ended → out of stock notification
      {
        leadTime: 15,
        available: 10,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Pumpkin',
        seasonStartDate: new Date(Date.now() - 60 * d),
        seasonEndDate: new Date(Date.now() - 5 * d),
      },
    ];
  }
});
