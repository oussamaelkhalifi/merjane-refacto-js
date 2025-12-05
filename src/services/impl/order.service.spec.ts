import {
  orders,
  ordersToProducts,
  PRODUCT_TYPE,
  products,
} from '@/db/schema.js';
import { type Database } from '@/db/type.js';
import { OrderRepository } from '@/repositories/order.repository.js';
import { ProductRepository } from '@/repositories/product.repository.js';
import { type FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import {
  cleanUp,
  createDatabaseMock,
} from '../../utils/test-utils/database-tools.ts.js';
import { type INotificationService } from '../notifications.port.js';
import { OrderService } from './order.service.js';
import { ProductService } from './product.service.js';

describe('OrderService Tests', () => {
  let notificationServiceMock: DeepMockProxy<INotificationService>;
  let loggerMock: DeepMockProxy<FastifyBaseLogger>;
  let orderService: OrderService;
  let productService: ProductService;
  let orderRepository: OrderRepository;
  let productRepository: ProductRepository;
  let databaseMock: Database;
  let databaseName: string;

  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    ({ databaseMock, databaseName } = await createDatabaseMock());
    notificationServiceMock = mockDeep<INotificationService>();
    loggerMock = mockDeep<FastifyBaseLogger>();

    productRepository = new ProductRepository(databaseMock);
    orderRepository = new OrderRepository(databaseMock);
    productService = new ProductService({
      ns: notificationServiceMock,
      pr: productRepository,
      logger: loggerMock,
    });
    orderService = new OrderService({
      or: orderRepository,
      ps: productService,
      logger: loggerMock,
    });
  });

  afterEach(async () => cleanUp(databaseName));

  describe('processOrder', () => {
    it('should throw error when order not found', async () => {
      const nonExistentOrderId = 999;
      await expect(
        orderService.processOrder(nonExistentOrderId)
      ).rejects.toThrow('Order 999 not found');
    });

    it('should process order with single product', async () => {
      const [insertedProduct] = await databaseMock
        .insert(products)
        .values({
          leadTime: 15,
          available: 10,
          type: PRODUCT_TYPE.NORMAL,
          name: 'USB Cable',
        })
        .returning({ id: products.id });

      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      await databaseMock.insert(ordersToProducts).values({
        orderId: insertedOrder!.id,
        productId: insertedProduct!.id,
      });

      const result = await orderService.processOrder(insertedOrder!.id);

      expect(result).toEqual({ orderId: insertedOrder!.id });
      const updatedProduct = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, insertedProduct!.id),
      });
      expect(updatedProduct!.available).toBe(9);
    });

    it('should process order with multiple products of different types', async () => {
      const productList = await databaseMock
        .insert(products)
        .values([
          {
            leadTime: 15,
            available: 30,
            type: PRODUCT_TYPE.NORMAL,
            name: 'USB Cable',
          },
          {
            leadTime: 15,
            available: 20,
            type: PRODUCT_TYPE.EXPIRABLE,
            name: 'Butter',
            expiryDate: new Date(Date.now() + 26 * DAY_MS),
          },
          {
            leadTime: 15,
            available: 10,
            type: PRODUCT_TYPE.SEASONAL,
            name: 'Watermelon',
            seasonStartDate: new Date(Date.now() - 2 * DAY_MS),
            seasonEndDate: new Date(Date.now() + 58 * DAY_MS),
          },
        ])
        .returning({ id: products.id });

      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      await databaseMock.insert(ordersToProducts).values(
        productList.map((p) => ({
          orderId: insertedOrder!.id,
          productId: p.id,
        }))
      );

      const result = await orderService.processOrder(insertedOrder!.id);

      expect(result).toEqual({ orderId: insertedOrder!.id });

      const allProducts = await databaseMock.query.products.findMany();
      expect(allProducts.find((p) => p.name === 'USB Cable')!.available).toBe(
        29
      );
      expect(allProducts.find((p) => p.name === 'Butter')!.available).toBe(19);
      expect(allProducts.find((p) => p.name === 'Watermelon')!.available).toBe(
        9
      );
    });

    it('should process order with out of stock product triggering notification', async () => {
      const [insertedProduct] = await databaseMock
        .insert(products)
        .values({
          leadTime: 10,
          available: 0,
          type: PRODUCT_TYPE.NORMAL,
          name: 'USB Dongle',
        })
        .returning({ id: products.id });

      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      await databaseMock.insert(ordersToProducts).values({
        orderId: insertedOrder!.id,
        productId: insertedProduct!.id,
      });

      await orderService.processOrder(insertedOrder!.id);

      expect(
        notificationServiceMock.sendDelayNotification
      ).toHaveBeenCalledWith(10, 'USB Dongle');
    });

    it('should process order with expired product triggering notification', async () => {
      const expiryDate = new Date(Date.now() - 2 * DAY_MS);
      const [insertedProduct] = await databaseMock
        .insert(products)
        .values({
          leadTime: 90,
          available: 6,
          type: PRODUCT_TYPE.EXPIRABLE,
          name: 'Milk',
          expiryDate,
        })
        .returning({ id: products.id });

      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      await databaseMock.insert(ordersToProducts).values({
        orderId: insertedOrder!.id,
        productId: insertedProduct!.id,
      });

      await orderService.processOrder(insertedOrder!.id);

      expect(
        notificationServiceMock.sendExpirationNotification
      ).toHaveBeenCalledWith('Milk', expiryDate);
      const updatedProduct = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, insertedProduct!.id),
      });
      expect(updatedProduct!.available).toBe(0);
    });

    it('should process order with out of season product', async () => {
      const [insertedProduct] = await databaseMock
        .insert(products)
        .values({
          leadTime: 15,
          available: 30,
          type: PRODUCT_TYPE.SEASONAL,
          name: 'Grapes',
          seasonStartDate: new Date(Date.now() + 180 * DAY_MS),
          seasonEndDate: new Date(Date.now() + 240 * DAY_MS),
        })
        .returning({ id: products.id });

      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      await databaseMock.insert(ordersToProducts).values({
        orderId: insertedOrder!.id,
        productId: insertedProduct!.id,
      });

      await orderService.processOrder(insertedOrder!.id);

      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).toHaveBeenCalledWith('Grapes');
    });

    it('should process empty order with no products', async () => {
      const [insertedOrder] = await databaseMock
        .insert(orders)
        .values({})
        .returning({ id: orders.id });

      const result = await orderService.processOrder(insertedOrder!.id);

      expect(result).toEqual({ orderId: insertedOrder!.id });
      expect(
        notificationServiceMock.sendDelayNotification
      ).not.toHaveBeenCalled();
      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).not.toHaveBeenCalled();
      expect(
        notificationServiceMock.sendExpirationNotification
      ).not.toHaveBeenCalled();
    });
  });
});
