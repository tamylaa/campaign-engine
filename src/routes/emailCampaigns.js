import express from 'express';

export function createEmailCampaignRoutes() {
  const router = express.Router();

  /**
   * Start Email Campaign
   * Called by Cloudflare Workers to initiate campaigns
   */
  router.post('/', async (req, res) => {
    try {
      const {
        type,
        targetAudience,
        tradeNetworkData,
        webhookUrl,
        scheduledFor
      } = req.body;

      console.log(`📧 Starting ${type} campaign for ${targetAudience?.length || 'all'} recipients`);

      // Campaign ID for tracking
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // If scheduled for future, use node-cron or Bull queue
      if (scheduledFor && new Date(scheduledFor) > new Date()) {
        // Schedule for later
        return res.json({
          success: true,
          campaignId,
          status: 'scheduled',
          scheduledFor,
          message: 'Campaign scheduled successfully'
        });
      }

      // Process immediately
      const result = await processEmailCampaign({
        campaignId,
        type,
        targetAudience,
        tradeNetworkData,
        webhookUrl
      });

      res.json({
        success: true,
        campaignId,
        status: 'processing',
        estimated: `${targetAudience?.length || 100} emails`,
        result
      });

    } catch (error) {
      console.error('❌ Campaign creation failed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create campaign',
        message: error.message
      });
    }
  });

  /**
   * Get Campaign Status
   */
  router.get('/:campaignId', async (req, res) => {
    const { campaignId } = req.params;
    
    // In real implementation, query from database/cache
    res.json({
      campaignId,
      status: 'completed',
      stats: {
        sent: 150,
        delivered: 148,
        opened: 45,
        clicked: 12,
        bounced: 2
      },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
  });

  /**
   * Campaign Templates (for email rendering)
   */
  router.get('/templates/:type', async (req, res) => {
    const { type } = req.params;
    
    const templates = {
      'trader-welcome': {
        subject: 'Welcome to Tamyla African Trading Network!',
        template: 'trader-welcome.html',
        requiredData: ['traderName', 'companyName', 'country']
      },
      'new-trade-opportunity': {
        subject: 'New Trading Opportunity: {{productName}} from {{sellerCountry}}',
        template: 'trade-opportunity.html',
        requiredData: ['productName', 'sellerName', 'sellerCountry', 'quantity', 'price']
      },
      'weekly-digest': {
        subject: 'Weekly African Trade Digest - {{weekOf}}',
        template: 'weekly-digest.html',
        requiredData: ['featuredProducts', 'tradeStats', 'newTraders']
      }
    };

    if (templates[type]) {
      res.json(templates[type]);
    } else {
      res.status(404).json({
        error: 'Template not found',
        availableTemplates: Object.keys(templates)
      });
    }
  });

  return router;
}

/**
 * Process Email Campaign
 * This integrates with your existing auto-email Cloudflare Worker
 */
async function processEmailCampaign({
  campaignId,
  type,
  targetAudience,
  tradeNetworkData,
  webhookUrl
}) {
  try {
    // Step 1: Get campaign template
    const template = await getCampaignTemplate(type);
    
    // Step 2: Generate personalized emails
    const emailJobs = targetAudience.map(recipient => ({
      to: recipient.email,
      subject: renderTemplate(template.subject, {
        ...recipient,
        ...tradeNetworkData
      }),
      html: renderEmailTemplate(template.template, {
        ...recipient,
        ...tradeNetworkData,
        campaignId
      }),
      campaignId,
      recipientId: recipient.id
    }));

    // Step 3: Send emails via your auto-email Cloudflare Worker
    const results = [];
    const batchSize = 10; // Send in batches to avoid overwhelming
    
    for (let i = 0; i < emailJobs.length; i += batchSize) {
      const batch = emailJobs.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(emailJob => sendEmailViaCloudflare(emailJob))
      );
      
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + batchSize < emailJobs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Step 4: Notify completion via webhook if provided
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          status: 'completed',
          results: {
            total: emailJobs.length,
            successful: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length
          }
        })
      });
    }

    return {
      total: emailJobs.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length
    };

  } catch (error) {
    console.error('❌ Campaign processing failed:', error);
    throw error;
  }
}

/**
 * Send email via your existing auto-email Cloudflare Worker
 */
async function sendEmailViaCloudflare(emailJob) {
  const response = await fetch('https://auto-email.tamyla.com/api/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.AUTO_EMAIL_API_KEY}`,
      'X-Service-Token': process.env.SERVICE_TOKEN
    },
    body: JSON.stringify(emailJob)
  });

  if (!response.ok) {
    throw new Error(`Auto-email API failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get campaign template
 */
async function getCampaignTemplate(type) {
  // In real implementation, load from database or file system
  const templates = {
    'trader-welcome': {
      subject: 'Welcome to Tamyla African Trading Network, {{traderName}}!',
      template: 'trader-welcome'
    },
    'new-trade-opportunity': {
      subject: 'New {{productCategory}} opportunity from {{sellerCountry}}',
      template: 'trade-opportunity'
    },
    'weekly-digest': {
      subject: 'African Trade Weekly - New opportunities await!',
      template: 'weekly-digest'
    }
  };

  return templates[type] || templates['trader-welcome'];
}

/**
 * Simple template rendering
 */
function renderTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

/**
 * Render email template with trade network components
 */
function renderEmailTemplate(templateName, data) {
  // This would load HTML templates and inject trade network data
  // For now, return a simple HTML template
  
  const baseTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Tamyla African Trading Network</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .product-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .product-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
        .cta-button { background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🌍 Tamyla African Trading Network</h1>
        <p>Connecting African exporters and importers</p>
      </div>
      
      <div class="content">
        <h2>Hello {{traderName}}!</h2>
        
        ${getTemplateContent(templateName, data)}
        
        <p>
          <a href="https://tamyla.com/dashboard?utm_source=email&utm_campaign={{campaignId}}" class="cta-button">
            View Your Dashboard
          </a>
        </p>
        
        <p>Best regards,<br>The Tamyla Team</p>
      </div>
    </body>
    </html>
  `;

  return renderTemplate(baseTemplate, data);
}

/**
 * Get template-specific content
 */
function getTemplateContent(templateName, data) {
  switch (templateName) {
    case 'trader-welcome':
      return `
        <p>Welcome to Africa's premier trading network! You're now connected to exporters and importers across 54 countries.</p>
        
        <h3>🚀 Get Started:</h3>
        <ul>
          <li>Complete your trader profile</li>
          <li>Add your products and inventory</li>
          <li>Discover trade opportunities</li>
          <li>Connect with verified traders</li>
        </ul>
      `;
      
    case 'trade-opportunity':
      return `
        <p>We found a new trading opportunity that matches your interests!</p>
        
        <div class="product-card">
          <h3>{{productName}}</h3>
          <p><strong>Seller:</strong> {{sellerName}} ({{sellerCountry}})</p>
          <p><strong>Quantity:</strong> {{quantity}} {{unit}}</p>
          <p><strong>Price:</strong> {{price}} {{currency}}/{{unit}}</p>
        </div>
        
        <p>This opportunity expires in 7 days. Contact the seller now to secure your order!</p>
      `;
      
    case 'weekly-digest':
      return `
        <h3>📊 This Week in African Trade</h3>
        <ul>
          <li>{{newProducts}} new products listed</li>
          <li>{{newTraders}} traders joined the network</li>
          <li>{{completedTrades}} successful trades completed</li>
        </ul>
        
        <h3>🔥 Featured Products</h3>
        <div class="product-grid">
          <!-- Featured products would be rendered here -->
          <div class="product-card">
            <h4>Premium Coffee Beans</h4>
            <p>From Ethiopia • 5 tons available</p>
          </div>
          <div class="product-card">
            <h4>Organic Shea Butter</h4>
            <p>From Ghana • 500kg available</p>
          </div>
        </div>
      `;
      
    default:
      return '<p>Stay connected with Africa\'s growing trade network!</p>';
  }
}
