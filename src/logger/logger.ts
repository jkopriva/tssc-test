/**
 * Main entry point for the simplified logger system
 * Auto-injects: projectName, worker (from test context) + timestamp (from Winston formatter)
 */

// Import for use in functions
import { LoggerFactory, closeAllLoggers as closeLoggers } from './factory/loggerFactory';

// Re-export LoggerFactory and utilities
export { LoggerFactory, closeLoggers as closeAllLoggers };

/** Default logger for API clients; supports (metadata, message) signature for structured logging */
const _defaultLogger = LoggerFactory.getLogger('default');
export const defaultLogger = {
  info: (meta: object, msg: string) => _defaultLogger.info(msg, meta),
  warn: (meta: object, msg: string) => _defaultLogger.warn(msg, meta),
  error: (meta: object, msg: string) => _defaultLogger.error(msg, meta),
};

// Export new Logger class (composite pattern)
export { Logger } from './core/Logger';

// Export Winston Logger type with alias to prevent naming collision
export { Logger as WinstonLogger } from 'winston';

// Export core logger types
export type {
  LoggerConfig,
  LogLevel,
  ConsoleTransportConfig,
  FileTransportConfig,
  LoggerName,
} from './types/logger.types';

// Export metadata types
export type { TestContext, LoggerMetadata } from './types/metadata.types';

// Export configuration utilities
export { loadConfigFromEnv, mergeConfig } from './config/loggerConfig';
