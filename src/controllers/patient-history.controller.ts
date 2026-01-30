import { Request, Response, NextFunction } from 'express';
import { PatientHistoryService } from '../services/patient-history.service';
import {
  createPatientHistorySchema,
  getPatientHistoryQuerySchema,
} from '../validators/patient-history.validator';

export class PatientHistoryController {
  private service: PatientHistoryService;

  constructor() {
    this.service = new PatientHistoryService();
  }

  createEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createPatientHistorySchema.parse(req.body);
      const event = await this.service.createEvent(input);
      res.status(201).json({ data: event });
    } catch (error) {
      next(error);
    }
  };

  getPatientHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { patientId } = req.params;
      const query = getPatientHistoryQuerySchema.parse(req.query);
      const events = await this.service.getPatientHistory(patientId, query);
      res.json({ data: events, count: events.length });
    } catch (error) {
      next(error);
    }
  };
}
