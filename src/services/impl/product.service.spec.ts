import { PRODUCT_TYPE, products, type Product } from '@/db/schema.js';
import { type Database } from '@/db/type.js';
import { ProductRepository } from '@/repositories/product.repository.js';
import { type FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import {
  cleanUp,
  createDatabaseMock,
} from '../../utils/test-utils/database-tools.ts.js';
import { type INotificationService } from '../notifications.port.js';
import { ProductService } from './product.service.js';

describe('ProductService Tests', () => {
  let notificationServiceMock: DeepMockProxy<INotificationService>;
  let loggerMock: DeepMockProxy<FastifyBaseLogger>;
  let productService: ProductService;
  let productRepository: ProductRepository;
  let databaseMock: Database;
  let databaseName: string;

  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    ({ databaseMock, databaseName } = await createDatabaseMock());
    notificationServiceMock = mockDeep<INotificationService>();
    loggerMock = mockDeep<FastifyBaseLogger>();
    productRepository = new ProductRepository(databaseMock);
    productService = new ProductService({
      ns: notificationServiceMock,
      pr: productRepository,
      logger: loggerMock,
    });
  });

  afterEach(async () => cleanUp(databaseName));

  // ============ NORMAL PRODUCT TESTS ============

  describe('processProduct - NORMAL type', () => {
    it('should decrement stock when available > 0', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 10,
        type: PRODUCT_TYPE.NORMAL,
        name: 'USB Cable',
        expiryDate: null,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, 1),
      });
      expect(result!.available).toBe(9);
      expect(
        notificationServiceMock.sendDelayNotification
      ).not.toHaveBeenCalled();
    });

    it('should notify delay when available = 0 and leadTime > 0', async () => {
      const product: Product = {
        id: 1,
        leadTime: 10,
        available: 0,
        type: PRODUCT_TYPE.NORMAL,
        name: 'USB Dongle',
        expiryDate: null,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendDelayNotification
      ).toHaveBeenCalledWith(10, 'USB Dongle');
    });

    it('should do nothing when available = 0 and leadTime = 0', async () => {
      const product: Product = {
        id: 1,
        leadTime: 0,
        available: 0,
        type: PRODUCT_TYPE.NORMAL,
        name: 'Discontinued Item',
        expiryDate: null,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendDelayNotification
      ).not.toHaveBeenCalled();
      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).not.toHaveBeenCalled();
    });
  });

  // ============ EXPIRABLE PRODUCT TESTS ============

  describe('processProduct - EXPIRABLE type', () => {
    it('should decrement stock when available > 0 and not expired', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Butter',
        expiryDate: new Date(Date.now() + 26 * DAY_MS),
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, 1),
      });
      expect(result!.available).toBe(29);
      expect(
        notificationServiceMock.sendExpirationNotification
      ).not.toHaveBeenCalled();
    });

    it('should send expiration notification and set out of stock when expired', async () => {
      const expiryDate = new Date(Date.now() - 2 * DAY_MS);
      const product: Product = {
        id: 1,
        leadTime: 90,
        available: 6,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Milk',
        expiryDate,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendExpirationNotification
      ).toHaveBeenCalledWith('Milk', expiryDate);
      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, 1),
      });
      expect(result!.available).toBe(0);
    });

    it('should send expiration notification when available = 0 and not expired', async () => {
      const expiryDate = new Date(Date.now() + 10 * DAY_MS);
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 0,
        type: PRODUCT_TYPE.EXPIRABLE,
        name: 'Yogurt',
        expiryDate,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendExpirationNotification
      ).toHaveBeenCalledWith('Yogurt', expiryDate);
    });
  });

  // ============ SEASONAL PRODUCT TESTS ============

  describe('processProduct - SEASONAL type', () => {
    it('should decrement stock when in season and available > 0', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Watermelon',
        expiryDate: null,
        seasonStartDate: new Date(Date.now() - 2 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 58 * DAY_MS),
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, 1),
      });
      expect(result!.available).toBe(29);
      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).not.toHaveBeenCalled();
    });

    it('should notify delay when in season, available = 0, and restock before season ends', async () => {
      const product: Product = {
        id: 1,
        leadTime: 5,
        available: 0,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Cherries',
        expiryDate: null,
        seasonStartDate: new Date(Date.now() - 10 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 30 * DAY_MS),
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendDelayNotification
      ).toHaveBeenCalledWith(5, 'Cherries');
    });

    it('should send out of stock when in season, available = 0, and restock after season ends', async () => {
      const product: Product = {
        id: 1,
        leadTime: 60,
        available: 0,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Strawberries',
        expiryDate: null,
        seasonStartDate: new Date(Date.now() - 10 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 20 * DAY_MS),
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).toHaveBeenCalledWith('Strawberries');
      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, 1),
      });
      expect(result!.available).toBe(0);
    });

    it('should send out of stock notification when season not started yet', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 30,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Grapes',
        expiryDate: null,
        seasonStartDate: new Date(Date.now() + 180 * DAY_MS),
        seasonEndDate: new Date(Date.now() + 240 * DAY_MS),
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).toHaveBeenCalledWith('Grapes');
    });

    it('should send out of stock notification when season already ended', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 10,
        type: PRODUCT_TYPE.SEASONAL,
        name: 'Pumpkin',
        expiryDate: null,
        seasonStartDate: new Date(Date.now() - 60 * DAY_MS),
        seasonEndDate: new Date(Date.now() - 5 * DAY_MS),
      };
      await databaseMock.insert(products).values(product);

      await productService.processProduct(product);

      expect(
        notificationServiceMock.sendOutOfStockNotification
      ).toHaveBeenCalledWith('Pumpkin');
    });
  });

  // ============ notifyDelay TESTS ============

  describe('notifyDelay', () => {
    it('should update product and send delay notification', async () => {
      const product: Product = {
        id: 1,
        leadTime: 15,
        available: 0,
        type: PRODUCT_TYPE.NORMAL,
        name: 'RJ45 Cable',
        expiryDate: null,
        seasonStartDate: null,
        seasonEndDate: null,
      };
      await databaseMock.insert(products).values(product);

      await productService.notifyDelay(product.leadTime, product);

      expect(product.available).toBe(0);
      expect(product.leadTime).toBe(15);
      expect(
        notificationServiceMock.sendDelayNotification
      ).toHaveBeenCalledWith(product.leadTime, product.name);
      const result = await databaseMock.query.products.findFirst({
        where: (p, { eq }) => eq(p.id, product.id),
      });
      expect(result).toEqual(product);
    });
  });
});
