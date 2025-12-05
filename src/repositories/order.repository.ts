import {eq} from 'drizzle-orm';
import {orders, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export type OrderWithProducts = {
	id: number;
	products: Array<{product: Product}>;
};

export class OrderRepository {
	public constructor(private readonly database: Database) {}

	public async findOrderWithProducts(orderId: number): Promise<OrderWithProducts | undefined> {
		return this.database.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {
				products: {
					columns: {},
					with: {
						product: true,
					},
				},
			},
		});
	}
}
