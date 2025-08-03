import pool from '../config/database.js';

// Audit logging service
class AuditLogger {
  /**
   * Create an audit log entry
   * @param {Object} options - Audit log options
   * @param {string} options.userId - User ID performing the action
   * @param {string} options.action - Action performed
   * @param {string} options.resource - Resource type (contact, template, campaign)
   * @param {string} options.resourceId - Resource ID
   * @param {Object} options.oldValues - Previous values (for updates)
   * @param {Object} options.newValues - New values (for creates/updates)
   * @param {string} options.ipAddress - IP address of the request
   * @param {string} options.userAgent - User agent string
   * @param {boolean} options.success - Whether the action was successful
   * @param {string} options.errorMessage - Error message if action failed
   * @param {Object} options.metadata - Additional metadata
   */
  static async create({
    userId,
    action,
    resource,
    resourceId = null,
    oldValues = null,
    newValues = null,
    ipAddress = null,
    userAgent = null,
    success = true,
    errorMessage = null,
    metadata = {}
  }) {
    try {
      const query = `
        INSERT INTO audit_logs (
          user_id, action, resource, resource_id, old_values, new_values,
          ip_address, user_agent, success, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at
      `;
      
      const values = [
        userId,
        action,
        resource,
        resourceId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        userAgent,
        success,
        errorMessage,
        JSON.stringify(metadata)
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw - audit logging shouldn't break the main operation
      return null;
    }
  }

  /**
   * Get audit logs for a user or resource
   * @param {Object} filters - Filter options
   * @param {string} filters.userId - Filter by user ID
   * @param {string} filters.resource - Filter by resource type
   * @param {string} filters.resourceId - Filter by resource ID
   * @param {string} filters.action - Filter by action
   * @param {Date} filters.startDate - Filter by start date
   * @param {Date} filters.endDate - Filter by end date
   * @param {number} filters.limit - Limit number of results
   * @param {number} filters.offset - Offset for pagination
   */
  static async get(filters = {}) {
    try {
      let query = `
        SELECT 
          id, user_id, action, resource, resource_id, old_values, new_values,
          ip_address, user_agent, success, error_message, metadata, created_at
        FROM audit_logs
        WHERE 1=1
      `;
      
      const values = [];
      let paramCount = 0;
      
      if (filters.userId) {
        paramCount++;
        query += ` AND user_id = $${paramCount}`;
        values.push(filters.userId);
      }
      
      if (filters.resource) {
        paramCount++;
        query += ` AND resource = $${paramCount}`;
        values.push(filters.resource);
      }
      
      if (filters.resourceId) {
        paramCount++;
        query += ` AND resource_id = $${paramCount}`;
        values.push(filters.resourceId);
      }
      
      if (filters.action) {
        paramCount++;
        query += ` AND action = $${paramCount}`;
        values.push(filters.action);
      }
      
      if (filters.startDate) {
        paramCount++;
        query += ` AND created_at >= $${paramCount}`;
        values.push(filters.startDate);
      }
      
      if (filters.endDate) {
        paramCount++;
        query += ` AND created_at <= $${paramCount}`;
        values.push(filters.endDate);
      }
      
      query += ` ORDER BY created_at DESC`;
      
      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(filters.limit);
      }
      
      if (filters.offset) {
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        values.push(filters.offset);
      }
      
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit log statistics
   * @param {string} userId - User ID to get stats for
   * @param {Date} startDate - Start date for stats
   * @param {Date} endDate - End date for stats
   */
  static async getStats(userId, startDate = null, endDate = null) {
    try {
      let query = `
        SELECT 
          action,
          resource,
          COUNT(*) as count,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as error_count
        FROM audit_logs
        WHERE user_id = $1
      `;
      
      const values = [userId];
      let paramCount = 1;
      
      if (startDate) {
        paramCount++;
        query += ` AND created_at >= $${paramCount}`;
        values.push(startDate);
      }
      
      if (endDate) {
        paramCount++;
        query += ` AND created_at <= $${paramCount}`;
        values.push(endDate);
      }
      
      query += ` GROUP BY action, resource ORDER BY count DESC`;
      
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Failed to get audit stats:', error);
      throw error;
    }
  }
}

// Middleware to automatically log API actions
export const auditMiddleware = (action, resource) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Capture request details
    const requestData = {
      userId: req.userContext?.userId,
      action,
      resource,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query
      }
    };
    
    // Override response methods to capture response data
    res.send = function(data) {
      res.locals.responseData = data;
      return originalSend.call(this, data);
    };
    
    res.json = function(data) {
      res.locals.responseData = data;
      return originalJson.call(this, data);
    };
    
    // Log after response is sent
    res.on('finish', async () => {
      try {
        const success = res.statusCode < 400;
        const logData = {
          ...requestData,
          resourceId: req.params.id || res.locals.resourceId,
          success,
          errorMessage: success ? null : res.locals.responseData?.error || 'Unknown error',
          metadata: {
            ...requestData.metadata,
            statusCode: res.statusCode,
            responseTime: Date.now() - req.startTime
          }
        };
        
        // Add old/new values for update operations
        if (action.includes('update') && req.body) {
          logData.newValues = req.body;
          logData.oldValues = res.locals.oldValues; // Should be set by the route handler
        } else if (action.includes('create') && res.locals.responseData) {
          logData.newValues = res.locals.responseData;
        }
        
        await AuditLogger.create(logData);
      } catch (error) {
        console.error('Audit logging failed:', error);
      }
    });
    
    // Add start time for response time calculation
    req.startTime = Date.now();
    
    next();
  };
};

export default AuditLogger;
