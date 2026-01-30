import app from './app';
import { logger } from './utils/logger';
import { closeDatabaseConnection } from './config/database';
import { closeRedisConnection } from './config/redis';
import { closeQueues, startQueueMetricsCollection } from './jobs/queue';

const PORT = parseInt(process.env.PORT || '3000');

const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);

  startQueueMetricsCollection();
});

const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  server.close(async () => {
    try {
      await closeDatabaseConnection();
      await closeRedisConnection();
      await closeQueues();
      logger.info('All connections closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
