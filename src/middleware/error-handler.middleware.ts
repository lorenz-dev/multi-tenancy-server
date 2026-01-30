import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger, logError } from '../utils/logger';
import { ZodError } from 'zod';

export function errorHandlerMiddleware(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logError(error, {
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
  });

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        statusCode: 400,
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        })),
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
  });

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      statusCode: 500,
    },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404,
    },
  });
}
