import { Request, Response, NextFunction } from 'express';
import { ClaimsService } from '../services/claims.service';
import {
  createClaimSchema,
  updateClaimSchema,
  listClaimsQuerySchema,
  bulkStatusUpdateSchema,
} from '../validators/claims.validator';

export class ClaimsController {
  private service: ClaimsService;

  constructor() {
    this.service = new ClaimsService();
  }

  createClaim = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createClaimSchema.parse(req.body);
      const claim = await this.service.createClaim(input);
      res.status(201).json({ data: claim });
    } catch (error) {
      next(error);
    }
  };

  getClaim = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const claim = await this.service.getClaim(id);
      res.json({ data: claim });
    } catch (error) {
      next(error);
    }
  };

  listClaims = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listClaimsQuerySchema.parse(req.query);
      const result = await this.service.listClaims(query);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateClaim = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = updateClaimSchema.parse(req.body);
      const claim = await this.service.updateClaim(id, updates);
      res.json({ data: claim });
    } catch (error) {
      next(error);
    }
  };

  bulkUpdateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = bulkStatusUpdateSchema.parse(req.body);
      const claims = await this.service.bulkUpdateStatus(input);
      res.json({ data: claims, count: claims.length });
    } catch (error) {
      next(error);
    }
  };
}
