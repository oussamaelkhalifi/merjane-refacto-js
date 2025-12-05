import {eq} from 'drizzle-orm';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class ProductRepository {
	public constructor(private readonly database: Database) {}

	public async updateProduct(product: Product): Promise<void> {
		await this.database.update(products).set(product).where(eq(products.id, product.id));
	}

	public async decrementStock(product: Product): Promise<void> {
		product.available -= 1;
		await this.updateProduct(product);
	}

	public async setOutOfStock(product: Product): Promise<void> {
		product.available = 0;
		await this.updateProduct(product);
	}
}
