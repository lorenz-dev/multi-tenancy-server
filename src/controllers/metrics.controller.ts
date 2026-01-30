import { Request, Response } from 'express';
import { register } from '../config/metrics';

export async function getMetrics(req: Request, res: Response) {
  res.set('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
}

export function healthCheck(req: Request, res: Response) {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
