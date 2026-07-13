import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import adminRoutes from './routes/admin.routes';
import restaurantRoutes from './routes/restaurant.routes';
import inventoryRoutes from './routes/inventory.routes';
import productionRoutes from './routes/production.routes';
import purchaseRoutes from './routes/purchase.routes';
import systemRoutes from './routes/system.routes';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet());
app.use(cors());

// Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 999999 : Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 100),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { message: 'Too many requests, please try again later.' } // Return JSON error format
});
app.use(limiter);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Setup Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/roles', roleRoutes);
app.use('/admin', adminRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/production', productionRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/system', systemRoutes);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

export default app;
