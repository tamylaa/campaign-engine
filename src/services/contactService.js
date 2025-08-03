import pool from '../config/database.js';

class ContactService {
  /**
   * Create a new contact
   */
  static async create(userId, contactData) {
    const { email, name, company, tags = [], metadata = {} } = contactData;
    
    const query = `
      INSERT INTO contacts (user_id, email, name, company, tags, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [userId, email, name, company, JSON.stringify(tags), JSON.stringify(metadata)];
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Contact with this email already exists for this user');
      }
      throw error;
    }
  }

  /**
   * Get contacts for a user with pagination and filtering
   */
  static async getByUser(userId, options = {}) {
    const {
      page = 1,
      limit = 50,
      search = '',
      tags = '',
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = options;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT id, email, name, company, tags, metadata, created_at, updated_at
      FROM contacts
      WHERE user_id = $1
    `;
    
    const values = [userId];
    let paramCount = 1;
    
    // Add search filter
    if (search) {
      paramCount++;
      query += ` AND (
        email ILIKE $${paramCount} OR 
        name ILIKE $${paramCount} OR 
        company ILIKE $${paramCount}
      )`;
      values.push(`%${search}%`);
    }
    
    // Add tags filter
    if (tags) {
      paramCount++;
      const tagArray = tags.split(',').map(tag => tag.trim());
      query += ` AND tags ?| $${paramCount}`;
      values.push(tagArray);
    }
    
    // Add sorting
    const allowedSortColumns = ['email', 'name', 'company', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;
    
    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    values.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    values.push(offset);
    
    try {
      const result = await pool.query(query, values);
      
      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) FROM contacts WHERE user_id = $1`;
      const countValues = [userId];
      let countParamCount = 1;
      
      if (search) {
        countParamCount++;
        countQuery += ` AND (
          email ILIKE $${countParamCount} OR 
          name ILIKE $${countParamCount} OR 
          company ILIKE $${countParamCount}
        )`;
        countValues.push(`%${search}%`);
      }
      
      if (tags) {
        countParamCount++;
        const tagArray = tags.split(',').map(tag => tag.trim());
        countQuery += ` AND tags ?| $${countParamCount}`;
        countValues.push(tagArray);
      }
      
      const countResult = await pool.query(countQuery, countValues);
      const total = parseInt(countResult.rows[0].count);
      
      return {
        contacts: result.rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a single contact by ID
   */
  static async getById(userId, contactId) {
    const query = `
      SELECT id, email, name, company, tags, metadata, created_at, updated_at
      FROM contacts
      WHERE id = $1 AND user_id = $2
    `;
    
    try {
      const result = await pool.query(query, [contactId, userId]);
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update a contact
   */
  static async update(userId, contactId, updateData) {
    const contact = await this.getById(userId, contactId);
    if (!contact) {
      throw new Error('Contact not found');
    }
    
    const allowedFields = ['email', 'name', 'company', 'tags', 'metadata'];
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        paramCount++;
        updates.push(`${key} = $${paramCount}`);
        
        if (key === 'tags' || key === 'metadata') {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });
    
    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    paramCount++;
    updates.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    
    paramCount++;
    values.push(contactId);
    paramCount++;
    values.push(userId);
    
    const query = `
      UPDATE contacts 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Contact with this email already exists for this user');
      }
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  static async delete(userId, contactId) {
    const query = `
      DELETE FROM contacts
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    try {
      const result = await pool.query(query, [contactId, userId]);
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get contacts by IDs (for campaign creation)
   */
  static async getByIds(userId, contactIds) {
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return [];
    }
    
    const query = `
      SELECT id, email, name, company, tags
      FROM contacts
      WHERE id = ANY($1) AND user_id = $2
    `;
    
    try {
      const result = await pool.query(query, [contactIds, userId]);
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Import contacts from CSV data
   */
  static async importFromCSV(userId, csvData) {
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };
    
    const validContacts = [];
    
    // Validate CSV data
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      
      try {
        if (!row.email || !row.email.trim()) {
          results.errors.push({ row: i + 1, error: 'Email is required' });
          continue;
        }
        
        const email = row.email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!emailRegex.test(email)) {
          results.errors.push({ row: i + 1, error: 'Invalid email format' });
          continue;
        }
        
        validContacts.push({
          email,
          name: row.name?.trim() || null,
          company: row.company?.trim() || null,
          tags: row.tags ? row.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : []
        });
        
      } catch (error) {
        results.errors.push({ row: i + 1, error: error.message });
      }
    }
    
    // Import valid contacts
    for (const contactData of validContacts) {
      try {
        await this.create(userId, contactData);
        results.imported++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          results.skipped++;
        } else {
          results.errors.push({ 
            email: contactData.email, 
            error: error.message 
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Export contacts to CSV format
   */
  static async exportToCSV(userId, options = {}) {
    const { search, tags } = options;
    
    let query = `
      SELECT email, name, company, tags, created_at
      FROM contacts
      WHERE user_id = $1
    `;
    
    const values = [userId];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      query += ` AND (
        email ILIKE $${paramCount} OR 
        name ILIKE $${paramCount} OR 
        company ILIKE $${paramCount}
      )`;
      values.push(`%${search}%`);
    }
    
    if (tags) {
      paramCount++;
      const tagArray = tags.split(',').map(tag => tag.trim());
      query += ` AND tags ?| $${paramCount}`;
      values.push(tagArray);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    try {
      const result = await pool.query(query, values);
      
      const csvData = result.rows.map(contact => ({
        email: contact.email,
        name: contact.name || '',
        company: contact.company || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
        created_at: contact.created_at.toISOString()
      }));
      
      return csvData;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get contact statistics for user
   */
  static async getStats(userId) {
    const queries = [
      // Total contacts
      `SELECT COUNT(*) as total FROM contacts WHERE user_id = $1`,
      
      // Contacts by company (top 10)
      `SELECT company, COUNT(*) as count 
       FROM contacts 
       WHERE user_id = $1 AND company IS NOT NULL 
       GROUP BY company 
       ORDER BY count DESC 
       LIMIT 10`,
       
      // Most used tags
      `SELECT tag, COUNT(*) as count
       FROM contacts, jsonb_array_elements_text(tags) as tag
       WHERE user_id = $1
       GROUP BY tag
       ORDER BY count DESC
       LIMIT 10`,
       
      // Recent contacts (last 30 days)
      `SELECT COUNT(*) as recent
       FROM contacts 
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'`
    ];
    
    try {
      const [totalResult, companiesResult, tagsResult, recentResult] = await Promise.all([
        pool.query(queries[0], [userId]),
        pool.query(queries[1], [userId]),
        pool.query(queries[2], [userId]),
        pool.query(queries[3], [userId])
      ]);
      
      return {
        total: parseInt(totalResult.rows[0].total),
        recentCount: parseInt(recentResult.rows[0].recent),
        topCompanies: companiesResult.rows,
        topTags: tagsResult.rows
      };
    } catch (error) {
      throw error;
    }
  }
}

export default ContactService;
