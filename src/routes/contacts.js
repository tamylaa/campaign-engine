import express from 'express';
import ContactService from '../services/contactService.js';
import { contactValidation } from '../middleware/validation.js';
import { authenticateToken, addUserContext, rateLimits } from '../middleware/security.js';
import { auditMiddleware } from '../services/auditLogger.js';

const router = express.Router();

// Apply authentication to all contact routes
router.use(authenticateToken);
router.use(addUserContext);

/**
 * GET /api/contacts
 * List contacts for the authenticated user
 */
router.get('/', 
  rateLimits.general,
  contactValidation.list,
  auditMiddleware('contacts_list', 'contact'),
  async (req, res) => {
    try {
      const { page, limit, search, tags, sortBy, sortOrder } = req.query;
      const userId = req.userContext.userId;
      
      const result = await ContactService.getByUser(userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        search,
        tags,
        sortBy,
        sortOrder
      });
      
      res.json({
        success: true,
        data: result.contacts,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error listing contacts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve contacts'
      });
    }
  }
);

/**
 * POST /api/contacts
 * Create a new contact
 */
router.post('/',
  rateLimits.general,
  contactValidation.create,
  auditMiddleware('contact_create', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const contactData = req.body;
      
      const contact = await ContactService.create(userId, contactData);
      
      // Set resource ID for audit logging
      res.locals.resourceId = contact.id;
      
      res.status(201).json({
        success: true,
        data: contact,
        message: 'Contact created successfully'
      });
    } catch (error) {
      console.error('Error creating contact:', error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to create contact'
        });
      }
    }
  }
);

/**
 * GET /api/contacts/:id
 * Get a specific contact
 */
router.get('/:id',
  rateLimits.general,
  contactValidation.update, // Reuse validation for ID param
  auditMiddleware('contact_view', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const contactId = req.params.id;
      
      const contact = await ContactService.getById(userId, contactId);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }
      
      res.json({
        success: true,
        data: contact
      });
    } catch (error) {
      console.error('Error retrieving contact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve contact'
      });
    }
  }
);

/**
 * PUT /api/contacts/:id
 * Update a contact
 */
router.put('/:id',
  rateLimits.general,
  contactValidation.update,
  auditMiddleware('contact_update', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const contactId = req.params.id;
      const updateData = req.body;
      
      // Get old values for audit log
      const oldContact = await ContactService.getById(userId, contactId);
      if (oldContact) {
        res.locals.oldValues = oldContact;
      }
      
      const contact = await ContactService.update(userId, contactId, updateData);
      
      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }
      
      res.json({
        success: true,
        data: contact,
        message: 'Contact updated successfully'
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message
        });
      } else if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to update contact'
        });
      }
    }
  }
);

/**
 * DELETE /api/contacts/:id
 * Delete a contact
 */
router.delete('/:id',
  rateLimits.general,
  contactValidation.update, // Reuse validation for ID param
  auditMiddleware('contact_delete', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const contactId = req.params.id;
      
      // Get contact for audit log
      const contact = await ContactService.getById(userId, contactId);
      if (contact) {
        res.locals.oldValues = contact;
      }
      
      const deletedContact = await ContactService.delete(userId, contactId);
      
      if (!deletedContact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete contact'
      });
    }
  }
);

/**
 * POST /api/contacts/import
 * Import contacts from CSV
 */
router.post('/import',
  rateLimits.contactImport,
  auditMiddleware('contacts_import', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const { contacts } = req.body;
      
      if (!Array.isArray(contacts)) {
        return res.status(400).json({
          success: false,
          error: 'Contacts must be an array'
        });
      }
      
      if (contacts.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No contacts provided'
        });
      }
      
      if (contacts.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 1000 contacts allowed per import'
        });
      }
      
      const result = await ContactService.importFromCSV(userId, contacts);
      
      res.json({
        success: true,
        data: result,
        message: `Import completed: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`
      });
    } catch (error) {
      console.error('Error importing contacts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to import contacts'
      });
    }
  }
);

/**
 * GET /api/contacts/export
 * Export contacts to CSV
 */
router.get('/export',
  rateLimits.general,
  auditMiddleware('contacts_export', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      const { search, tags } = req.query;
      
      const contacts = await ContactService.exportToCSV(userId, { search, tags });
      
      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
      
      // Convert to CSV format
      if (contacts.length === 0) {
        return res.send('email,name,company,tags,created_at\n');
      }
      
      const headers = Object.keys(contacts[0]);
      const csvContent = [
        headers.join(','),
        ...contacts.map(contact => 
          headers.map(header => {
            const value = contact[header] || '';
            // Escape commas and quotes in CSV
            return `"${value.toString().replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');
      
      res.send(csvContent);
    } catch (error) {
      console.error('Error exporting contacts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export contacts'
      });
    }
  }
);

/**
 * GET /api/contacts/stats
 * Get contact statistics
 */
router.get('/stats',
  rateLimits.general,
  auditMiddleware('contacts_stats', 'contact'),
  async (req, res) => {
    try {
      const userId = req.userContext.userId;
      
      const stats = await ContactService.getStats(userId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error retrieving contact stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve contact statistics'
      });
    }
  }
);

export default router;
