import fastifyPlugin from 'fastify-plugin';
import {type ZodTypeProvider} from 'fastify-type-provider-zod';
import {processOrderParamsSchema} from '@/validations/order.validation.js';

export const orderController = fastifyPlugin(async server => {
  server.withTypeProvider<ZodTypeProvider>().post(
    '/orders/:orderId/processOrder',
    {
      schema: {
        params: processOrderParamsSchema,
      },
    },
    async (request, reply) => {
      const { orderId } = request.params;
      request.log.info({ orderId }, 'Processing order request started');

      // Resolve OrderService from request scope (has request-scoped logger)
      const orderService = request.diScope.resolve('os');
      const result = await orderService.processOrder(orderId);

      request.log.info(
        { orderId, result },
        'Processing order request completed'
      );
      return reply.send(result);
    }
  );
});
