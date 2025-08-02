#!/usr/bin/env node

/**
 * Database Migration Script for Railway PostgreSQL
 * Handles schema creation and initial data setup
 */

const { Pool } = require('pg');

// Use Railway's provided DATABASE_URL or fallback to local
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/campaign_engine';

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const migrations = [
  {
    name: '001_create_campaigns_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'sms', 'whatsapp', 'platform')),
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed')),
        target_audience JSONB,
        content JSONB NOT NULL,
        schedule_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `
  },
  {
    name: '002_create_campaign_executions_table', 
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_executions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        recipient VARCHAR(255) NOT NULL,
        channel VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        error_message TEXT,
        response_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: '003_create_campaign_templates_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        subject VARCHAR(500),
        content TEXT NOT NULL,
        variables JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `
  },
  {
    name: '004_create_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(type);
      CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
      CREATE INDEX IF NOT EXISTS idx_executions_campaign_id ON campaign_executions(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON campaign_executions(status);
      CREATE INDEX IF NOT EXISTS idx_executions_recipient ON campaign_executions(recipient);
    `
  }
];

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database migrations...');
    
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Get already executed migrations
    const { rows: executedMigrations } = await client.query(
      'SELECT migration_name FROM schema_migrations'
    );
    const executedNames = executedMigrations.map(row => row.migration_name);
    
    // Run pending migrations
    for (const migration of migrations) {
      if (executedNames.includes(migration.name)) {
        console.log(`⏭️  Skipping ${migration.name} (already executed)`);
        continue;
      }
      
      console.log(`▶️  Running ${migration.name}...`);
      await client.query('BEGIN');
      
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [migration.name]
        );
        await client.query('COMMIT');
        console.log(`✅ Completed ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    
    console.log('🎉 All migrations completed successfully!');
    
    // Insert default templates
    await seedDefaultTemplates(client);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedDefaultTemplates(client) {
  console.log('🌱 Seeding default templates...');
  
  const defaultTemplates = [
    {
      name: 'Welcome Email',
      type: 'email',
      subject: 'Welcome to {{platform_name}}!',
      content: `
        <h1>Welcome {{first_name}}!</h1>
        <p>Thank you for joining our African trading network.</p>
        <p>Start exploring trading opportunities and connect with other traders across Africa.</p>
        <a href="{{dashboard_url}}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Access Your Dashboard
        </a>
      `,
      variables: ['first_name', 'platform_name', 'dashboard_url']
    },
    {
      name: 'Product Alert SMS',
      type: 'sms',
      subject: null,
      content: 'New {{product_category}} available from {{trader_name}}. Quantity: {{quantity}}. Price: {{price}}. Contact: {{contact_info}}',
      variables: ['product_category', 'trader_name', 'quantity', 'price', 'contact_info']
    },
    {
      name: 'Trade Opportunity Email',
      type: 'email',
      subject: 'New Trade Opportunity: {{product_name}}',
      content: `
        <h2>Trade Opportunity Alert</h2>
        <p><strong>Product:</strong> {{product_name}}</p>
        <p><strong>Trader:</strong> {{trader_name}}</p>
        <p><strong>Location:</strong> {{location}}</p>
        <p><strong>Quantity:</strong> {{quantity}}</p>
        <p><strong>Price:</strong> {{price}}</p>
        <p><strong>Description:</strong> {{description}}</p>
        <a href="{{contact_link}}">Contact Trader</a>
      `,
      variables: ['product_name', 'trader_name', 'location', 'quantity', 'price', 'description', 'contact_link']
    }
  ];
  
  for (const template of defaultTemplates) {
    await client.query(`
      INSERT INTO campaign_templates (name, type, subject, content, variables)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [
      template.name,
      template.type,
      template.subject,
      template.content,
      JSON.stringify(template.variables)
    ]);
  }
  
  console.log('✅ Default templates seeded');
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
