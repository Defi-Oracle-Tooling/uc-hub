/**
 * WebRTC Signaling Server
 * 
 * This service provides WebRTC signaling functionality for establishing
 * peer connections between clients.
 */

const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { activeConnections } = require('../../middleware/monitoring/metrics');
const { createSpan } = require('../../middleware/monitoring/tracing');

class SignalingServer {
  constructor() {
    this.io = null;
    this.rooms = new Map();
    this.users = new Map();
    this.onConnection = this.onConnection.bind(this);
  }
  
  /**
   * Initialize the signaling server
   * @param {Object} server - HTTP or HTTPS server instance
   * @param {Object} options - Socket.IO options
   */
  initialize(server, options = {}) {
    // Default options
    const defaultOptions = {
      path: '/webrtc',
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'],
      pingInterval: 10000,
      pingTimeout: 5000
    };
    
    // Create Socket.IO server
    this.io = new Server(server, { ...defaultOptions, ...options });
    
    // Set up connection handler
    this.io.on('connection', this.onConnection);
    
    console.log('WebRTC signaling server initialized');
  }
  
  /**
   * Handle new socket connections
   * @param {Socket} socket - Socket.IO socket
   */
  onConnection(socket) {
    console.log(`New connection: ${socket.id}`);
    
    // Update active connections metric
    activeConnections.inc();
    
    // Set up event handlers
    socket.on('join', (data) => this.handleJoin(socket, data));
    socket.on('leave', (data) => this.handleLeave(socket, data));
    socket.on('offer', (data) => this.handleOffer(socket, data));
    socket.on('answer', (data) => this.handleAnswer(socket, data));
    socket.on('candidate', (data) => this.handleCandidate(socket, data));
    socket.on('message', (data) => this.handleMessage(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
    
    // Send initial connection acknowledgment
    socket.emit('connected', { id: socket.id });
  }
  
  /**
   * Handle join room requests
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Join request data
   */
  async handleJoin(socket, data) {
    await createSpan('signaling.join', { roomId: data.roomId }, async () => {
      const roomId = data.roomId || uuidv4();
      const userId = data.userId || socket.id;
      const username = data.username || `User-${socket.id.substr(0, 6)}`;
      
      // Create room if it doesn't exist
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      
      // Add user to room
      const room = this.rooms.get(roomId);
      room.add(socket.id);
      
      // Store user information
      this.users.set(socket.id, {
        id: userId,
        socketId: socket.id,
        username,
        roomId
      });
      
      // Join the Socket.IO room
      socket.join(roomId);
      
      // Get existing users in the room
      const usersInRoom = [];
      for (const socketId of room) {
        if (socketId !== socket.id) {
          const user = this.users.get(socketId);
          if (user) {
            usersInRoom.push({
              id: user.id,
              socketId,
              username: user.username
            });
          }
        }
      }
      
      // Notify the new user about existing users
      socket.emit('room_joined', {
        roomId,
        userId,
        users: usersInRoom
      });
      
      // Notify existing users about the new user
      socket.to(roomId).emit('user_joined', {
        roomId,
        user: {
          id: userId,
          socketId: socket.id,
          username
        }
      });
      
      console.log(`User ${username} (${socket.id}) joined room ${roomId}`);
    });
  }
  
  /**
   * Handle leave room requests
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Leave request data
   */
  async handleLeave(socket, data) {
    await createSpan('signaling.leave', { roomId: data?.roomId }, async () => {
      const user = this.users.get(socket.id);
      
      if (user) {
        const roomId = user.roomId;
        
        // Remove user from room
        if (this.rooms.has(roomId)) {
          const room = this.rooms.get(roomId);
          room.delete(socket.id);
          
          // Delete room if empty
          if (room.size === 0) {
            this.rooms.delete(roomId);
          }
        }
        
        // Leave the Socket.IO room
        socket.leave(roomId);
        
        // Notify other users
        socket.to(roomId).emit('user_left', {
          roomId,
          socketId: socket.id,
          userId: user.id
        });
        
        // Remove user information
        this.users.delete(socket.id);
        
        console.log(`User ${user.username} (${socket.id}) left room ${roomId}`);
      }
    });
  }
  
  /**
   * Handle WebRTC offers
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Offer data
   */
  async handleOffer(socket, data) {
    await createSpan('signaling.offer', { targetId: data.targetId }, async () => {
      const { targetId, sdp } = data;
      
      if (targetId) {
        // Forward the offer to the target
        this.io.to(targetId).emit('offer', {
          sdp,
          sourceId: socket.id
        });
      }
    });
  }
  
  /**
   * Handle WebRTC answers
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Answer data
   */
  async handleAnswer(socket, data) {
    await createSpan('signaling.answer', { targetId: data.targetId }, async () => {
      const { targetId, sdp } = data;
      
      if (targetId) {
        // Forward the answer to the target
        this.io.to(targetId).emit('answer', {
          sdp,
          sourceId: socket.id
        });
      }
    });
  }
  
  /**
   * Handle ICE candidates
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - ICE candidate data
   */
  async handleCandidate(socket, data) {
    await createSpan('signaling.candidate', { targetId: data.targetId }, async () => {
      const { targetId, candidate } = data;
      
      if (targetId) {
        // Forward the ICE candidate to the target
        this.io.to(targetId).emit('candidate', {
          candidate,
          sourceId: socket.id
        });
      }
    });
  }
  
  /**
   * Handle custom messages
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Message data
   */
  async handleMessage(socket, data) {
    await createSpan('signaling.message', { targetId: data.targetId }, async () => {
      const { targetId, message, broadcast } = data;
      
      if (broadcast) {
        // Get the user's room
        const user = this.users.get(socket.id);
        
        if (user && user.roomId) {
          // Broadcast to all users in the room except the sender
          socket.to(user.roomId).emit('message', {
            message,
            sourceId: socket.id
          });
        }
      } else if (targetId) {
        // Send to specific user
        this.io.to(targetId).emit('message', {
          message,
          sourceId: socket.id
        });
      }
    });
  }
  
  /**
   * Handle socket disconnections
   * @param {Socket} socket - Socket.IO socket
   */
  async handleDisconnect(socket) {
    await createSpan('signaling.disconnect', { socketId: socket.id }, async () => {
      // Update active connections metric
      activeConnections.dec();
      
      // Handle as if the user left the room
      this.handleLeave(socket, {});
      
      console.log(`Disconnected: ${socket.id}`);
    });
  }
  
  /**
   * Get information about a room
   * @param {string} roomId - Room ID
   * @returns {Object|null} Room information
   */
  getRoomInfo(roomId) {
    if (!this.rooms.has(roomId)) {
      return null;
    }
    
    const room = this.rooms.get(roomId);
    const users = [];
    
    for (const socketId of room) {
      const user = this.users.get(socketId);
      if (user) {
        users.push({
          id: user.id,
          socketId,
          username: user.username
        });
      }
    }
    
    return {
      roomId,
      userCount: users.length,
      users
    };
  }
  
  /**
   * Get all active rooms
   * @returns {Array} Array of room information
   */
  getAllRooms() {
    const rooms = [];
    
    for (const [roomId, room] of this.rooms.entries()) {
      rooms.push({
        roomId,
        userCount: room.size
      });
    }
    
    return rooms;
  }
  
  /**
   * Create a new room
   * @param {Object} options - Room options
   * @returns {string} Room ID
   */
  createRoom(options = {}) {
    const roomId = options.roomId || uuidv4();
    
    // Create room if it doesn't exist
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    
    return roomId;
  }
  
  /**
   * Delete a room
   * @param {string} roomId - Room ID
   * @returns {boolean} Whether the room was deleted
   */
  deleteRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      return false;
    }
    
    // Get all users in the room
    const room = this.rooms.get(roomId);
    const socketIds = [...room];
    
    // Notify all users in the room
    this.io.to(roomId).emit('room_closed', { roomId });
    
    // Remove all users from the room
    for (const socketId of socketIds) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
      }
      
      // Update user information
      const user = this.users.get(socketId);
      if (user && user.roomId === roomId) {
        this.users.delete(socketId);
      }
    }
    
    // Delete the room
    this.rooms.delete(roomId);
    
    return true;
  }
  
  /**
   * Broadcast a message to all users in a room
   * @param {string} roomId - Room ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {boolean} Whether the message was sent
   */
  broadcastToRoom(roomId, event, data) {
    if (!this.rooms.has(roomId)) {
      return false;
    }
    
    this.io.to(roomId).emit(event, data);
    return true;
  }
  
  /**
   * Send a message to a specific user
   * @param {string} socketId - Socket ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {boolean} Whether the message was sent
   */
  sendToUser(socketId, event, data) {
    const socket = this.io.sockets.sockets.get(socketId);
    
    if (!socket) {
      return false;
    }
    
    socket.emit(event, data);
    return true;
  }
  
  /**
   * Get the number of connected users
   * @returns {number} Number of connected users
   */
  getUserCount() {
    return this.users.size;
  }
  
  /**
   * Get the number of active rooms
   * @returns {number} Number of active rooms
   */
  getRoomCount() {
    return this.rooms.size;
  }
}

module.exports = new SignalingServer();
