import { body, param, query, validationResult } from 'express-validator';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Set up DOMPurify for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Validation error handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// HTML sanitization helper
export const sanitizeHTML = (html) => {
  return purify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'style', 'class'],
    ALLOWED_URI_REGEXP: /^https?:\/\//,
    KEEP_CONTENT: true
  });
};

// Contact validation rules
export const contactValidation = {
  create: [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required')
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
    body('name')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Name must be less than 255 characters')
      .matches(/^[a-zA-Z0-9\s\-\.\']+$/)
      .withMessage('Name contains invalid characters'),
    body('company')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Company must be less than 255 characters')
      .matches(/^[a-zA-Z0-9\s\-\.\'&]+$/)
      .withMessage('Company name contains invalid characters'),
    body('tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Tags must be an array with max 10 items'),
    body('tags.*')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Each tag must be 1-50 characters')
      .matches(/^[a-zA-Z0-9\-_]+$/)
      .withMessage('Tags can only contain letters, numbers, hyphens, and underscores'),
    handleValidationErrors
  ],
  
  update: [
    param('id').isUUID().withMessage('Valid contact ID required'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email required')
      .isLength({ max: 255 })
      .withMessage('Email must be less than 255 characters'),
    body('name')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Name must be less than 255 characters')
      .matches(/^[a-zA-Z0-9\s\-\.\']+$/)
      .withMessage('Name contains invalid characters'),
    body('company')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Company must be less than 255 characters'),
    body('tags')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Tags must be an array with max 10 items'),
    handleValidationErrors
  ],

  list: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('search')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Search term must be less than 255 characters'),
    query('tags')
      .optional()
      .isString()
      .withMessage('Tags filter must be a string'),
    handleValidationErrors
  ]
};

// Template validation rules
export const templateValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Template name required (max 255 characters)')
      .matches(/^[a-zA-Z0-9\s\-_\.]+$/)
      .withMessage('Template name contains invalid characters'),
    body('subject')
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Subject required (max 500 characters)'),
    body('body_html')
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('HTML body required (max 50,000 characters)')
      .custom((value) => {
        // Sanitize HTML and check if it's still valid
        const sanitized = sanitizeHTML(value);
        if (!sanitized || sanitized.trim().length === 0) {
          throw new Error('HTML body contains no valid content after sanitization');
        }
        return true;
      }),
    body('body_text')
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('Text body required (max 50,000 characters)'),
    body('variables')
      .optional()
      .isArray({ max: 20 })
      .withMessage('Variables must be an array with max 20 items'),
    body('variables.*')
      .optional()
      .trim()
      .matches(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      .withMessage('Variable names must be valid identifiers'),
    handleValidationErrors
  ],
  
  update: [
    param('id').isUUID().withMessage('Valid template ID required'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Template name must be 1-255 characters')
      .matches(/^[a-zA-Z0-9\s\-_\.]+$/)
      .withMessage('Template name contains invalid characters'),
    body('subject')
      .optional()
      .trim()
      .isLength({ min: 1, max: 500 })
      .withMessage('Subject must be 1-500 characters'),
    body('body_html')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('HTML body must be 1-50,000 characters')
      .custom((value) => {
        if (value) {
          const sanitized = sanitizeHTML(value);
          if (!sanitized || sanitized.trim().length === 0) {
            throw new Error('HTML body contains no valid content after sanitization');
          }
        }
        return true;
      }),
    body('body_text')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50000 })
      .withMessage('Text body must be 1-50,000 characters'),
    handleValidationErrors
  ]
};

// Campaign validation rules
export const campaignValidation = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 1, max: 255 })
      .withMessage('Campaign name required (max 255 characters)')
      .matches(/^[a-zA-Z0-9\s\-_\.]+$/)
      .withMessage('Campaign name contains invalid characters'),
    body('template_id')
      .isUUID()
      .withMessage('Valid template ID required'),
    body('contact_ids')
      .isArray({ min: 1, max: 1000 })
      .withMessage('Contact IDs must be an array with 1-1000 items'),
    body('contact_ids.*')
      .isUUID()
      .withMessage('Each contact ID must be a valid UUID'),
    body('scheduled_at')
      .optional()
      .isISO8601()
      .withMessage('Scheduled date must be in ISO 8601 format')
      .custom((value) => {
        if (value && new Date(value) <= new Date()) {
          throw new Error('Scheduled date must be in the future');
        }
        return true;
      }),
    handleValidationErrors
  ],

  send: [
    param('id').isUUID().withMessage('Valid campaign ID required'),
    handleValidationErrors
  ]
};

// File upload validation (for CSV imports)
export const fileValidation = {
  csvImport: [
    body('file')
      .custom((value, { req }) => {
        if (!req.file) {
          throw new Error('CSV file is required');
        }
        if (req.file.mimetype !== 'text/csv' && !req.file.originalname.endsWith('.csv')) {
          throw new Error('File must be a CSV');
        }
        if (req.file.size > 5 * 1024 * 1024) { // 5MB limit
          throw new Error('File size must be less than 5MB');
        }
        return true;
      }),
    handleValidationErrors
  ]
};

// Sanitize request body middleware
export const sanitizeBody = (req, res, next) => {
  if (req.body) {
    // Sanitize HTML content in specific fields
    if (req.body.body_html) {
      req.body.body_html = sanitizeHTML(req.body.body_html);
    }
    
    // Trim string values
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
};
