const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('config');

class WebSocketServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
      }
    });
    
    this.userSockets = new Map(); // userId -> Set of socket IDs
    this.socketUsers = new Map(); // socketId -> userId
    this.conversationUsers = new Map(); // conversationId -> Set of userIds
    this.lastActivity = new Map(); // userId -> timestamp
    
    this.setupMiddleware();
    this.setupEventHandlers();
    this.startPresenceCleanup();
  }

  setupMiddleware() {
    // Authenticate WebSocket connections using JWT
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = jwt.verify(token, config.get('jwtSecret'));
        socket.user = decoded;
        
        // Store user's socket for later use
        this.addUserSocket(decoded.id, socket.id);
        
        next();
      } catch (error) {
        next(new Error('Invalid authentication token'));
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', async (socket) => {
      try {
        const userId = socket.user.id;
        console.log(`User connected: ${userId}`);

        // Handle ping/pong for connection health
        socket.on('ping', (data) => {
          this.updateUserActivity(userId);
          socket.emit('pong', data);
        });

        // Handle presence updates
        socket.on('presence', ({ status }) => {
          this.updateUserPresence(userId, status);
        });

        // Handle joining conversation rooms
        socket.on('conversation:join', (conversationId) => {
          this.addUserToConversation(userId, conversationId);
          socket.join(`conversation:${conversationId}`);
          
          // Notify others in conversation that user joined
          socket.to(`conversation:${conversationId}`).emit('user:online', {
            userId: socket.user.id,
            name: socket.user.name
          });
        });

        // Handle leaving conversation rooms
        socket.on('conversation:leave', (conversationId) => {
          this.removeUserFromConversation(userId, conversationId);
          socket.leave(`conversation:${conversationId}`);
          
          // Notify others in conversation that user left
          socket.to(`conversation:${conversationId}`).emit('user:offline', {
            userId: socket.user.id,
            name: socket.user.name
          });
        });

        // Handle typing indicators
        socket.on('typing:start', (conversationId) => {
          socket.to(`conversation:${conversationId}`).emit('user:typing', {
            userId: socket.user.id,
            name: socket.user.name,
            conversationId
          });
        });

        socket.on('typing:stop', (conversationId) => {
          socket.to(`conversation:${conversationId}`).emit('user:stopped-typing', {
            userId: socket.user.id,
            name: socket.user.name,
            conversationId
          });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
          this.handleDisconnect(socket);
        });

        // Emit initial presence
        this.broadcastUserPresence(userId, true);
        
      } catch (error) {
        console.error('WebSocket connection error:', error);
        socket.disconnect(true);
      }
    });
  }

  // User socket management
  addUserSocket(userId, socketId) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socketId);
    this.socketUsers.set(socketId, userId);
    this.updateUserActivity(userId);
  }

  removeUserSocket(socketId) {
    const userId = this.socketUsers.get(socketId);
    if (userId) {
      const userSockets = this.userSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
          this.userSockets.delete(userId);
          this.broadcastUserPresence(userId, false);
        }
      }
      this.socketUsers.delete(socketId);
    }
  }

  // Conversation management
  addUserToConversation(userId, conversationId) {
    if (!this.conversationUsers.has(conversationId)) {
      this.conversationUsers.set(conversationId, new Set());
    }
    this.conversationUsers.get(conversationId).add(userId);
  }

  removeUserFromConversation(userId, conversationId) {
    const conversationUsers = this.conversationUsers.get(conversationId);
    if (conversationUsers) {
      conversationUsers.delete(userId);
      if (conversationUsers.size === 0) {
        this.conversationUsers.delete(conversationId);
      }
    }
  }

  // Presence management
  updateUserActivity(userId) {
    this.lastActivity.set(userId, Date.now());
  }

  updateUserPresence(userId, status) {
    this.updateUserActivity(userId);
    this.broadcastUserPresence(userId, status === 'online');
  }

  broadcastUserPresence(userId, isOnline) {
    const user = this.getUserById(userId);
    if (!user) return;

    // Broadcast to all relevant conversations
    this.conversationUsers.forEach((users, conversationId) => {
      if (users.has(userId)) {
        this.io.to(`conversation:${conversationId}`).emit('user:presence', {
          userId,
          name: user.name,
          status: isOnline ? 'online' : 'offline',
          lastActive: this.lastActivity.get(userId)
        });
      }
    });
  }

  // Cleanup inactive users
  startPresenceCleanup() {
    setInterval(() => {
      const now = Date.now();
      const inactiveTimeout = 5 * 60 * 1000; // 5 minutes

      this.lastActivity.forEach((lastActive, userId) => {
        if (now - lastActive > inactiveTimeout) {
          this.handleInactiveUser(userId);
        }
      });
    }, 60000); // Check every minute
  }

  handleInactiveUser(userId) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      });
    }
  }

  // Handle disconnection
  handleDisconnect(socket) {
    const userId = socket.user?.id;
    if (!userId) return;

    this.removeUserSocket(socket.id);

    // Remove from all conversations if no other sockets
    if (!this.userSockets.has(userId)) {
      this.conversationUsers.forEach((users, conversationId) => {
        if (users.has(userId)) {
          this.removeUserFromConversation(userId, conversationId);
          this.io.to(`conversation:${conversationId}`).emit('user:offline', {
            userId: socket.user.id,
            name: socket.user.name
          });
        }
      });
    }
  }

  // Helper methods
  async verifyUser(token) {
    // Implementation depends on your auth system
    try {
      return await verifyAuthToken(token);
    } catch (error) {
      return null;
    }
  }

  async getUserById(userId) {
    // Implementation depends on your user model
    try {
      return await User.findById(userId);
    } catch (error) {
      return null;
    }
  }

  // Send message to specific conversation
  sendToConversation(conversationId, type, payload) {
    this.io.to(`conversation:${conversationId}`).emit(type, payload);
  }
}

module.exports = WebSocketServer;