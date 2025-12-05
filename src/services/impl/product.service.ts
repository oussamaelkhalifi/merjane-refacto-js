import { type Product, type ProductType, PRODUCT_TYPE } from '@/db/schema.js';
import { type ProductRepository } from '@/repositories/product.repository.js';
import { type Cradle } from '@fastify/awilix';
import { type FastifyBaseLogger } from 'fastify';
import { type INotificationService } from '../notifications.port.js';

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

type ProductHandler = (product: Product) => Promise<void>;

export class ProductService {
  private readonly ns: INotificationService;
  private readonly productRepository: ProductRepository;
  private readonly logger: FastifyBaseLogger;
  private readonly productHandlers: Record<ProductType, ProductHandler>;

  public constructor({ ns, pr, logger }: Pick<Cradle, 'ns' | 'pr' | 'logger'>) {
    this.ns = ns;
    this.productRepository = pr;
    this.logger = logger;
    this.productHandlers = {
      [PRODUCT_TYPE.NORMAL]: async (product) =>
        this.processNormalProduct(product),
      [PRODUCT_TYPE.SEASONAL]: async (product) =>
        this.processSeasonalProduct(product),
      [PRODUCT_TYPE.EXPIRABLE]: async (product) =>
        this.processExpirableProduct(product),
    } satisfies Record<ProductType, ProductHandler>;
  }

  public async processProduct(product: Product): Promise<void> {
    this.logger.debug(
      {
        productId: product.id,
        type: product.type,
        available: product.available,
      },
      'Processing product by type'
    );
    const handler = this.productHandlers[product.type];
    if (!handler) {
      this.logger.error(
        { productId: product.id, type: product.type },
        'No handler found for product type'
      );
      throw new Error(`No handler for product type ${product.type}`);
    }
    await handler(product);
  }

  public async notifyDelay(leadTime: number, p: Product): Promise<void> {
    p.leadTime = leadTime;
    await this.productRepository.updateProduct(p);
    this.ns.sendDelayNotification(leadTime, p.name);
  }

  public async handleSeasonalProduct(p: Product): Promise<void> {
    const currentDate = new Date();
    const restockDate = new Date(
      currentDate.getTime() + p.leadTime * MILLISECONDS_PER_DAY
    );
    if (restockDate > p.seasonEndDate!) {
      this.ns.sendOutOfStockNotification(p.name);
      await this.productRepository.setOutOfStock(p);
      return;
    }
    if (p.seasonStartDate! > currentDate) {
      this.ns.sendOutOfStockNotification(p.name);
      await this.productRepository.updateProduct(p);
      return;
    }
    await this.notifyDelay(p.leadTime, p);
  }

  public async handleExpiredProduct(p: Product): Promise<void> {
    const currentDate = new Date();
    if (p.available > 0 && p.expiryDate! > currentDate) {
      await this.productRepository.decrementStock(p);
      return;
    }
    this.ns.sendExpirationNotification(p.name, p.expiryDate!);
    await this.productRepository.setOutOfStock(p);
  }

  private async processNormalProduct(product: Product): Promise<void> {
    if (product.available > 0) {
      this.logger.debug(
        { productId: product.id },
        'Decrementing stock for normal product'
      );
      await this.productRepository.decrementStock(product);
      return;
    }
    if (product.leadTime > 0) {
      this.logger.debug(
        { productId: product.id, leadTime: product.leadTime },
        'Notifying delay for normal product'
      );
      await this.notifyDelay(product.leadTime, product);
      return;
    }
    this.logger.debug(
      { productId: product.id },
      'No action for normal product (out of stock, no lead time)'
    );
  }

  private async processSeasonalProduct(product: Product): Promise<void> {
    const currentDate = new Date();
    const inSeason =
      currentDate > product.seasonStartDate! &&
      currentDate < product.seasonEndDate!;

    if (inSeason && product.available > 0) {
      this.logger.debug(
        { productId: product.id },
        'Decrementing stock for seasonal product (in season)'
      );
      await this.productRepository.decrementStock(product);
      return;
    }
    this.logger.debug(
      { productId: product.id, inSeason },
      'Handling out-of-season or unavailable seasonal product'
    );
    await this.handleSeasonalProduct(product);
  }

  private async processExpirableProduct(product: Product): Promise<void> {
    const currentDate = new Date();
    const notExpired = product.expiryDate! > currentDate;

    if (product.available > 0 && notExpired) {
      this.logger.debug(
        { productId: product.id },
        'Decrementing stock for expirable product'
      );
      await this.productRepository.decrementStock(product);
      return;
    }
    this.logger.debug(
      { productId: product.id, expired: !notExpired },
      'Handling expired or unavailable product'
    );
    await this.handleExpiredProduct(product);
  }
}
