import { io } from 'socket.io-client';

/**
 * WebSocket service for real-time communication
 * Handles connection, authentication, and events for the Socket.io client
 */
class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Initialize WebSocket connection
   * @param {string} token - JWT auth token
   */
  connect(token) {
    if (!token) {
      console.error('Token is required to establish WebSocket connection');
      return;
    }

    if (this.socket && this.isConnected) {
      console.log('WebSocket connection already established');
      return;
    }

    // Create socket connection with auth token
    this.socket = io(process.env.REACT_APP_WS_URL || 'http://localhost:4000', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this._notifyListeners('connection_status', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`WebSocket disconnected: ${reason}`);
      this.isConnected = false;
      this._notifyListeners('connection_status', { 
        connected: false,
        reason 
      });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts += 1;
      
      // If maximum reconnection attempts reached, stop trying
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.socket.disconnect();
        this._notifyListeners('connection_error', {
          error: 'Maximum reconnection attempts reached'
        });
      }
    });

    // Listen for custom events from server
    this.socket.on('user:online', (data) => {
      this._notifyListeners('user_online', data);
    });

    this.socket.on('user:offline', (data) => {
      this._notifyListeners('user_offline', data);
    });

    this.socket.on('user:typing', (data) => {
      this._notifyListeners('user_typing', data);
    });

    this.socket.on('user:stopped-typing', (data) => {
      this._notifyListeners('user_stopped_typing', data);
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Join a conversation room to receive messages
   * @param {string} conversationId - ID of conversation to join
   */
  joinConversation(conversationId) {
    if (!this.isConnected || !conversationId) return;
    
    this.socket.emit('conversation:join', conversationId);
    console.log(`Joined conversation: ${conversationId}`);
  }

  /**
   * Leave a conversation room
   * @param {string} conversationId - ID of conversation to leave
   */
  leaveConversation(conversationId) {
    if (!this.isConnected || !conversationId) return;
    
    this.socket.emit('conversation:leave', conversationId);
    console.log(`Left conversation: ${conversationId}`);
  }

  /**
   * Send typing indicator to conversation
   * @param {string} conversationId - Conversation ID
   * @param {boolean} isTyping - Whether user is typing or stopped typing
   */
  sendTypingStatus(conversationId, isTyping) {
    if (!this.isConnected || !conversationId) return;
    
    const event = isTyping ? 'typing:start' : 'typing:stop';
    this.socket.emit(event, conversationId);
  }

  /**
   * Register event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function when event is received
   * @returns {Function} Function to remove the listener
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    
    this.listeners[event].push(callback);
    
    // Return function to remove this listener
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  /**
   * Notify all listeners of an event
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  _notifyListeners(event, data) {
    const callbacks = this.listeners[event] || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;