import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import middleware
import { securityHeaders, rateLimits, requestLogger } from './middleware/security.js';
import { sanitizeBody } from './middleware/validation.js';

// Import routes
import { createEmailCampaignRoutes } from './routes/emailCampaigns.js';
import { createTradeNetworkRoutes } from './routes/tradeNetwork.js';
import { createIntegrationRoutes } from './routes/integrations.js';
import contactRoutes from './routes/contacts.js';

// Import database connection
import pool, { testConnection } from './config/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(securityHeaders);
app.use(requestLogger);

// CORS configuration for trading portal integration
app.use(cors({
  origin: [
    'https://tamyla.com',
    'https://auth.tamyla.com',
    'https://data.tamyla.com',
    'https://auto-email.tamyla.com',
    process.env.FRONTEND_URL,
    // Development origins
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
    process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : null,
    process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:8787' : null
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Service-Token',
    'X-Request-ID'
  ]
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Sanitization middleware
app.use(sanitizeBody);

// General rate limiting
app.use(rateLimits.general);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'campaign-engine',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database health check
app.get('/health/db', async (req, res) => {
  const healthCheck = await testConnection();
  
  if (healthCheck.status === 'healthy') {
    res.json(healthCheck);
  } else {
    res.status(503).json(healthCheck);
  }
});

// API Routes
app.use('/api/contacts', contactRoutes);

// Legacy routes (keeping for compatibility)
app.use('/api/email-campaigns', createEmailCampaignRoutes());
app.use('/api/trade-network', createTradeNetworkRoutes());
app.use('/api/integrations', createIntegrationRoutes());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Campaign Engine',
    description: 'Multi-channel campaign orchestration engine for African trading network',
    version: process.env.npm_package_version || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      database: '/health/db',
      contacts: '/api/contacts',
      campaigns: '/api/email-campaigns',
      tradeNetwork: '/api/trade-network',
      integrations: '/api/integrations'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
  
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Campaign Engine running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Database check: http://localhost:${PORT}/health/db`);
  console.log(`📮 Contacts API: http://localhost:${PORT}/api/contacts`);
});

export default app;
