import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createEmailCampaignRoutes } from './routes/emailCampaigns.js';
import { createTradeNetworkRoutes } from './routes/tradeNetwork.js';
import { createIntegrationRoutes } from './routes/integrations.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration for Cloudflare Workers integration
app.use(cors({
  origin: [
    'https://tamyla.com',
    'https://auth.tamyla.com',
    'https://data.tamyla.com',
    'https://auto-email.tamyla.com',
    // Add your Cloudflare Worker domains
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'campaign-engine',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Service authentication middleware
app.use('/api', (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  const authHeader = req.headers.authorization;
  
  // Allow requests with either service token or user JWT
  if (serviceToken === process.env.SERVICE_TOKEN || authHeader?.startsWith('Bearer ')) {
    next();
  } else {
    res.status(401).json({ 
      error: 'Authentication required',
      message: 'Provide either X-Service-Token or Authorization header'
    });
  }
});

// API Routes
app.use('/api/campaigns', createEmailCampaignRoutes());
app.use('/api/trade-network', createTradeNetworkRoutes());
app.use('/api/integrations', createIntegrationRoutes());

// Webhook endpoints (for Cloudflare Workers to call back)
app.post('/webhooks/cloudflare/:service', (req, res) => {
  const { service } = req.params;
  const data = req.body;
  
  console.log(`📨 Webhook received from ${service}:`, data);
  
  // Process webhook based on service
  switch (service) {
    case 'auth':
      // Handle auth-related webhooks (user registration, etc.)
      break;
    case 'data':
      // Handle data-related webhooks (new products, trades)
      break;
    case 'auto-email':
      // Handle email delivery confirmations
      break;
    default:
      console.warn(`Unknown webhook service: ${service}`);
  }
  
  res.json({ received: true, timestamp: new Date().toISOString() });
});

// Integration test endpoint
app.get('/test/cloudflare-integration', async (req, res) => {
  const results = {};
  
  try {
    // Test connection to your Cloudflare Workers
    const services = [
      { name: 'auth', url: 'https://auth.tamyla.com/health' },
      { name: 'data', url: 'https://data.tamyla.com/health' },
      { name: 'auto-email', url: 'https://auto-email.tamyla.com/health' }
    ];
    
    for (const service of services) {
      try {
        const response = await fetch(service.url, {
          headers: {
            'X-Service-Token': process.env.SERVICE_TOKEN
          },
          timeout: 5000
        });
        
        results[service.name] = {
          status: response.ok ? 'connected' : 'error',
          statusCode: response.status,
          responseTime: `${Date.now()}ms` // Simplified
        };
      } catch (error) {
        results[service.name] = {
          status: 'error',
          error: error.message
        };
      }
    }
    
    res.json({
      integration: 'cloudflare-workers',
      timestamp: new Date().toISOString(),
      results
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Integration test failed',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  
  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'GET /test/cloudflare-integration',
      'POST /api/campaigns',
      'POST /webhooks/cloudflare/:service'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Campaign Engine started on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Integration test: http://localhost:${PORT}/test/cloudflare-integration`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
