// Authentication middleware for JWT verification
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authentication middleware for protecting routes
 * Verifies JWT and adds user to request object
 */
const protect = async (req, res, next) => {
  let token;
  
  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
      
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-dev-only');
      
      // Add user to req object (without password)
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }
      
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }
  
  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

/**
 * Role-based authorization middleware
 * @param {string[]} roles - Array of allowed roles
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized for this action' });
    }
    
    next();
  };
};

/**
 * GraphQL context middleware
 * Used to set the user context for GraphQL resolvers
 */
const graphqlContext = async ({ req }) => {
  try {
    // Get token from request headers
    const token = req.headers.authorization?.split(' ')[1] || '';
    
    if (!token) {
      return { user: null };
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-for-dev-only');
    
    // Find user
    const user = await User.findById(decoded.id).select('-password');
    
    return { user };
  } catch (error) {
    console.error('GraphQL context error:', error);
    return { user: null };
  }
};

/**
 * Refresh token generator
 * Creates a new access token using a refresh token
 */
const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token is required' });
  }
  
  try {
    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken, 
      process.env.REFRESH_TOKEN_SECRET || 'refresh-token-secret-for-dev-only'
    );
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    // Generate new access token
    const accessToken = user.generateToken();
    
    res.status(200).json({ accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

module.exports = { protect, authorize, graphqlContext, refreshToken };