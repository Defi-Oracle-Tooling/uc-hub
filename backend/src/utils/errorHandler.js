// Central error handler for GraphQL and REST endpoints
const { GraphQLError } = require('graphql');

// Custom error types
const ERROR_TYPES = {
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  INTERNAL: 'INTERNAL_SERVER_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  BAD_INPUT: 'BAD_USER_INPUT',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR'
};

/**
 * Create a GraphQL error with consistent formatting
 * @param {string} message - Error message
 * @param {string} type - Error type from ERROR_TYPES
 * @param {Object} extensions - Additional error data
 * @returns {GraphQLError} Formatted GraphQL error
 */
const createGraphQLError = (message, type = ERROR_TYPES.INTERNAL, extensions = {}) => {
  return new GraphQLError(message, {
    extensions: {
      code: type,
      ...extensions
    }
  });
};

/**
 * Format error response for REST API
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Additional error details
 * @returns {Object} Formatted REST error
 */
const createRESTError = (message, statusCode = 500, details = {}) => {
  return {
    error: {
      message,
      statusCode,
      ...details
    }
  };
};

/**
 * Map common error types to HTTP status codes
 * @param {string} errorType - Error type from ERROR_TYPES
 * @returns {number} HTTP status code
 */
const getStatusCodeForErrorType = (errorType) => {
  switch (errorType) {
    case ERROR_TYPES.AUTHENTICATION:
      return 401;
    case ERROR_TYPES.AUTHORIZATION:
      return 403;
    case ERROR_TYPES.VALIDATION:
    case ERROR_TYPES.BAD_INPUT:
      return 400;
    case ERROR_TYPES.NOT_FOUND:
      return 404;
    case ERROR_TYPES.RATE_LIMIT:
      return 429;
    case ERROR_TYPES.EXTERNAL_SERVICE:
      return 502;
    case ERROR_TYPES.INTERNAL:
    default:
      return 500;
  }
};

/**
 * Custom GraphQL error formatter for Apollo Server
 * Ensures consistent error format in responses
 */
const formatGraphQLError = (formattedError, error) => {
  // Don't expose internal server errors in production
  if (process.env.NODE_ENV === 'production' && 
      formattedError.extensions?.code === ERROR_TYPES.INTERNAL) {
    return {
      message: 'An unexpected error occurred',
      extensions: {
        code: ERROR_TYPES.INTERNAL
      }
    };
  }
  
  // Ensure all errors have a code
  if (!formattedError.extensions?.code) {
    formattedError.extensions = {
      ...formattedError.extensions,
      code: ERROR_TYPES.INTERNAL
    };
  }
  
  return formattedError;
};

/**
 * Express error middleware for REST API
 */
const expressErrorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  const statusCode = err.statusCode || 500;
  const errorMessage = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'An unexpected error occurred'
    : err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: {
      message: errorMessage,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    }
  });
};

module.exports = {
  ERROR_TYPES,
  createGraphQLError,
  createRESTError,
  getStatusCodeForErrorType,
  formatGraphQLError,
  expressErrorHandler
};