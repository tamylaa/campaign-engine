#!/usr/bin/env node

/**
 * Database Migration Script for Railway PostgreSQL - ES6 Version
 * Handles schema creation and initial data setup for Campaign Engine MVP
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create our own pool for migrations with appropriate timeouts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

const migrations = [
  {
    name: '001_create_contacts_table',
    sql: `
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        company VARCHAR(255),
        tags JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, email)
      );
    `
  },
  {
    name: '002_create_email_templates_table',
    sql: `
      CREATE TABLE IF NOT EXISTS email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT NOT NULL,
        variables JSONB DEFAULT '[]'::jsonb,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
  {
    name: '003_create_campaigns_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        template_id UUID NOT NULL REFERENCES email_templates(id),
        name VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        recipient_count INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        scheduled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        sent_at TIMESTAMP
      );
    `
  },
  {
    name: '004_create_campaign_recipients_table',
    sql: `
      CREATE TABLE IF NOT EXISTS campaign_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        error_message TEXT,
        tracking_id UUID DEFAULT gen_random_uuid(),
        UNIQUE(campaign_id, contact_id)
      );
    `
  },
  {
    name: '005_create_audit_logs_table',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id VARCHAR(255),
        old_values JSONB,
        new_values JSONB,
        metadata JSONB DEFAULT '{}'::jsonb,
        ip_address INET,
        user_agent TEXT,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `
  },
  {
    name: '006_create_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
      CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
      CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `
  },
  {
    name: '007_seed_default_templates',
    sql: `
      INSERT INTO email_templates (user_id, name, subject, body_html, body_text, variables, is_default)
      VALUES 
        (
          '00000000-0000-0000-0000-000000000000',
          'Product Inquiry',
          'Inquiry about {{product_name}}',
          '<p>Dear {{contact_name}},</p><p>I hope this email finds you well. I am writing to inquire about <strong>{{product_name}}</strong> that your company, {{company_name}}, offers.</p><p>Could you please provide more information about:</p><ul><li>Product specifications</li><li>Pricing and minimum order quantities</li><li>Delivery terms and timeframes</li><li>Quality certifications</li></ul><p>We are based in {{sender_company}} and are looking for reliable suppliers for our upcoming projects.</p><p>Thank you for your time and I look forward to hearing from you soon.</p><p>Best regards,<br>{{sender_name}}<br>{{sender_company}}</p>',
          'Dear {{contact_name}}, I hope this email finds you well. I am writing to inquire about {{product_name}} that your company, {{company_name}}, offers. Could you please provide more information about: Product specifications, Pricing and minimum order quantities, Delivery terms and timeframes, Quality certifications. We are based in {{sender_company}} and are looking for reliable suppliers for our upcoming projects. Thank you for your time and I look forward to hearing from you soon. Best regards, {{sender_name}}, {{sender_company}}',
          '["contact_name", "company_name", "product_name", "sender_name", "sender_company"]',
          true
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          'Price Update',
          'Updated Pricing for {{product_category}} - {{sender_company}}',
          '<p>Dear {{contact_name}},</p><p>Greetings from {{sender_company}}!</p><p>We are pleased to inform you about our updated pricing for <strong>{{product_category}}</strong>, effective from {{effective_date}}.</p><p><strong>Key Updates:</strong></p><ul><li>Competitive pricing aligned with market standards</li><li>Volume discounts available for bulk orders</li><li>Special rates for long-term partnerships</li></ul><p>As one of our valued trading partners, we wanted to ensure you are among the first to know about these changes.</p><p>Thank you for your continued partnership.</p><p>Best regards,<br>{{sender_name}}<br>{{sender_company}}</p>',
          'Dear {{contact_name}}, Greetings from {{sender_company}}! We are pleased to inform you about our updated pricing for {{product_category}}, effective from {{effective_date}}. Key Updates: Competitive pricing aligned with market standards, Volume discounts available for bulk orders, Special rates for long-term partnerships. As one of our valued trading partners, we wanted to ensure you are among the first to know about these changes. Thank you for your continued partnership. Best regards, {{sender_name}}, {{sender_company}}',
          '["contact_name", "sender_company", "product_category", "effective_date", "sender_name"]',
          true
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          'Trade Opportunity',
          'Exciting Trade Opportunity - {{opportunity_type}}',
          '<p>Dear {{contact_name}},</p><p>I hope you are doing well. I am reaching out to share an exciting trade opportunity that might interest {{company_name}}.</p><p><strong>Opportunity Details:</strong></p><ul><li><strong>Product:</strong> {{product_name}}</li><li><strong>Quantity:</strong> {{quantity}}</li><li><strong>Origin:</strong> {{origin_country}}</li><li><strong>Timeline:</strong> {{timeline}}</li></ul><p>This opportunity comes with competitive pricing, quality assurance and certifications, flexible payment terms, and reliable logistics support.</p><p>If you are interested, please let me know as soon as possible.</p><p>Best regards,<br>{{sender_name}}<br>{{sender_company}}</p>',
          'Dear {{contact_name}}, I hope you are doing well. I am reaching out to share an exciting trade opportunity that might interest {{company_name}}. Opportunity Details: Product: {{product_name}}, Quantity: {{quantity}}, Origin: {{origin_country}}, Timeline: {{timeline}}. This opportunity comes with competitive pricing, quality assurance and certifications, flexible payment terms, and reliable logistics support. If you are interested, please let me know as soon as possible. Best regards, {{sender_name}}, {{sender_company}}',
          '["contact_name", "company_name", "product_name", "quantity", "origin_country", "timeline", "sender_name", "sender_company", "opportunity_type"]',
          true
        )
      ON CONFLICT DO NOTHING;
    `
  }
];

async function runMigrations() {
  console.log('🚀 Starting Campaign Engine database migrations...');
  console.log('📡 Database URL:', process.env.DATABASE_URL ? 'Loaded' : 'Missing');
  
  try {
    // Test basic connection first
    console.log('🔍 Testing database connection...');
    const testResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful:', testResult.rows[0].current_time);
    
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Get already executed migrations
    const executedResult = await pool.query('SELECT name FROM schema_migrations');
    const executedMigrations = new Set(executedResult.rows.map(row => row.name));
    
    // Run pending migrations
    for (const migration of migrations) {
      if (!executedMigrations.has(migration.name)) {
        console.log(`📝 Running migration: ${migration.name}`);
        
        try {
          await pool.query('BEGIN');
          await pool.query(migration.sql);
          await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
          await pool.query('COMMIT');
          
          console.log(`✅ Migration ${migration.name} completed successfully`);
        } catch (error) {
          await pool.query('ROLLBACK');
          console.error(`❌ Migration ${migration.name} failed:`, error);
          throw error;
        }
      } else {
        console.log(`⏭️  Migration ${migration.name} already executed`);
      }
    }
    
    console.log('🎉 All migrations completed successfully!');
    
    // Verify tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('📋 Database tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Check default templates
    const templatesResult = await pool.query('SELECT COUNT(*) FROM email_templates WHERE is_default = true');
    console.log(`📧 Default email templates: ${templatesResult.rows[0].count}`);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].includes('migrate-new.js')) {
  runMigrations();
}

export default runMigrations;
