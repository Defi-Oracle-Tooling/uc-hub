class WebSocketService {
  constructor() {
    this.socket = null;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.baseReconnectDelay = 1000; // Start with 1 second
  }

  connect(token) {
    if (this.socket?.connected) return;

    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:4000/graphql';
    this.socket = new WebSocket(wsUrl);
    this.socket.onopen = this.handleOpen.bind(this);
    this.socket.onclose = this.handleClose.bind(this);
    this.socket.onmessage = this.handleMessage.bind(this);
    this.socket.onerror = this.handleError.bind(this);

    // Add auth token to connection
    if (token) {
      this.socket.token = token;
    }
  }

  handleOpen() {
    console.log('WebSocket connected');
    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    this.updatePresence('online'); // Set initial presence
  }

  handleClose() {
    console.log('WebSocket disconnected');
    this.attemptReconnect();
  }

  handleError(error) {
    console.error('WebSocket error:', error);
    this.attemptReconnect();
  }

  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      const handlers = this.handlers.get(data.type) || [];
      handlers.forEach(callback => callback(data.payload));
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    // Calculate delay with exponential backoff
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    
    console.log(`Attempting to reconnect in ${delay}ms...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(this.socket?.token);
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.updatePresence('offline');
      this.socket.close();
      this.socket = null;
    }
  }

  on(type, callback) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type).push(callback);
  }

  off(type, callback) {
    if (!this.handlers.has(type)) return;
    const handlers = this.handlers.get(type);
    const index = handlers.indexOf(callback);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  send(type, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Socket is not connected');
      return;
    }

    this.socket.send(JSON.stringify({ type, payload }));
  }

  // Conversation-specific methods
  sendTypingStatus(conversationId, isTyping) {
    this.send('typing_status', { conversationId, isTyping });
  }

  markMessageAsRead(messageId, conversationId) {
    this.send('message_read', { messageId, conversationId });
  }

  updatePresence(status) {
    this.send('presence', { status });
  }

  // Set up ping/pong for connection health check
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}

export default new WebSocketService();