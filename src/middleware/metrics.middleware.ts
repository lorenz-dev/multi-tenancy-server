import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal, isMetricsEnabled } from '../config/metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isMetricsEnabled()) {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;

    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode.toString(),
    };

    httpRequestDuration.observe(labels, duration);

    httpRequestTotal.inc(labels);
  });

  next();
}
