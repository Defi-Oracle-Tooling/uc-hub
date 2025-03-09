const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

/**
 * Sets up WebSocket server with Socket.io
 * @param {Object} httpServer - HTTP server instance to attach Socket.io
 * @returns {Object} Socket.io server instance
 */
function setupWebSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Authentication middleware for WebSocket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token is missing'));
      }
      
      // Verify token
      const decoded = jwt.verify(
        token, 
        process.env.JWT_SECRET || 'fallback-secret-key-for-dev-only'
      );
      
      // Find user and attach to socket
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.user = user;
      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Handle new connections
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);
    
    // Join personal room for direct messages
    socket.join(`user:${socket.user.id}`);
    
    // Online presence handling
    socket.broadcast.emit('user:online', {
      userId: socket.user.id,
      name: socket.user.name
    });
    
    // Handle joining conversation rooms
    socket.on('conversation:join', (conversationId) => {
      console.log(`${socket.user.name} joined conversation: ${conversationId}`);
      socket.join(`conversation:${conversationId}`);
    });
    
    // Handle leaving conversation rooms
    socket.on('conversation:leave', (conversationId) => {
      console.log(`${socket.user.name} left conversation: ${conversationId}`);
      socket.leave(`conversation:${conversationId}`);
    });
    
    // Handle typing indicators
    socket.on('typing:start', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user:typing', {
        conversationId,
        userId: socket.user.id,
        name: socket.user.name
      });
    });
    
    socket.on('typing:stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user:stopped-typing', {
        conversationId,
        userId: socket.user.id
      });
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name} (${socket.id})`);
      socket.broadcast.emit('user:offline', {
        userId: socket.user.id
      });
    });
  });

  return io;
}

module.exports = { setupWebSocketServer };