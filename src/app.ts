import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth.middleware';
import { tenantContextMiddleware } from './middleware/tenant-context.middleware';
import { errorHandlerMiddleware, notFoundHandler } from './middleware/error-handler.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { ClaimsController } from './controllers/claims.controller';
import { PatientHistoryController } from './controllers/patient-history.controller';
import { getMetrics, healthCheck } from './controllers/metrics.controller';
import { logger } from './utils/logger';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(metricsMiddleware);

app.get('/health', healthCheck);
app.get('/metrics', getMetrics);

const claimsController = new ClaimsController();
const patientHistoryController = new PatientHistoryController();

app.use('/api', authMiddleware, tenantContextMiddleware);

app.post('/api/claims', claimsController.createClaim);
app.get('/api/claims', claimsController.listClaims);
app.get('/api/claims/:id', claimsController.getClaim);
app.patch('/api/claims/:id', claimsController.updateClaim);
app.post('/api/claims/bulk-status-update', claimsController.bulkUpdateStatus);

app.post('/api/patient-history', patientHistoryController.createEvent);
app.get('/api/patient-history/:patientId', patientHistoryController.getPatientHistory);

app.use(notFoundHandler);

app.use(errorHandlerMiddleware);

export default app;
