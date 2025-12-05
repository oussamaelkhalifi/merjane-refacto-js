/* eslint-disable no-await-in-loop */
import { type Cradle } from '@fastify/awilix';
import { type FastifyBaseLogger } from 'fastify';
import { type ProductService } from './product.service.js';
import { type OrderRepository } from '@/repositories/order.repository.js';

export class OrderService {
  private readonly orderRepository: OrderRepository;
  private readonly productService: ProductService;
  private readonly logger: FastifyBaseLogger;

  public constructor({ or, ps, logger }: Pick<Cradle, 'or' | 'ps' | 'logger'>) {
    this.orderRepository = or;
    this.productService = ps;
    this.logger = logger;
  }

  public async processOrder(orderId: number): Promise<{ orderId: number }> {
    this.logger.info({ orderId }, 'Fetching order with products');
    const order = await this.orderRepository.findOrderWithProducts(orderId);

    if (!order) {
      this.logger.warn({ orderId }, 'Order not found');
      throw new Error(`Order ${orderId} not found`);
    }

    this.logger.info(
      { orderId, productCount: order.products.length },
      'Processing products for order'
    );

    for (const { product } of order.products) {
      this.logger.debug(
        {
          productId: product.id,
          productName: product.name,
          productType: product.type,
        },
        'Processing product'
      );
      await this.productService.processProduct(product);
    }

    this.logger.info({ orderId }, 'Order processing completed');
    return { orderId: order.id };
  }
}
