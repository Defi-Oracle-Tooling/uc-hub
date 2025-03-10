/**
 * gRPC Server Implementation
 * 
 * This module provides the gRPC server implementation for high-performance,
 * low-latency backend operations.
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { createSpan } = require('../../middleware/monitoring/tracing');
const { grpcRequestsTotal, grpcRequestDuration } = require('../../middleware/monitoring/metrics');
const jwtService = require('../security/jwt');

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../proto/communication.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const communicationService = protoDescriptor.communication;

// Import service implementations
const userService = require('./services/userService');
const messageService = require('./services/messageService');
const meetingService = require('./services/meetingService');
const translationService = require('./services/translationService');
const platformService = require('./services/platformService');

/**
 * Authentication middleware for gRPC
 * @param {Object} call - gRPC call object
 * @param {Function} callback - Callback function
 * @returns {Promise<boolean>} Whether authentication was successful
 */
async function authenticate(call) {
  try {
    const metadata = call.metadata.getMap();
    const token = metadata.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return false;
    }
    
    // Verify JWT token
    const decoded = await jwtService.verifyToken(token);
    
    // Attach user to call
    call.user = decoded;
    
    return true;
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }
}

/**
 * Create a gRPC method handler with authentication and metrics
 * @param {Function} handler - The method handler
 * @param {boolean} requireAuth - Whether authentication is required
 * @returns {Function} The wrapped method handler
 */
function createMethodHandler(handler, requireAuth = true) {
  return async (call, callback) => {
    const methodName = handler.name || 'unknown';
    const startTime = Date.now();
    
    // Create tracing span
    await createSpan(`grpc.${methodName}`, {}, async () => {
      try {
        // Authenticate if required
        if (requireAuth) {
          const isAuthenticated = await authenticate(call);
          
          if (!isAuthenticated) {
            const error = new Error('Unauthenticated');
            error.code = grpc.status.UNAUTHENTICATED;
            callback(error);
            return;
          }
        }
        
        // Call the handler
        await handler(call, callback);
        
        // Record metrics
        const duration = Date.now() - startTime;
        grpcRequestsTotal.inc({ method: methodName, status: 'success' });
        grpcRequestDuration.observe({ method: methodName }, duration / 1000);
      } catch (error) {
        console.error(`Error in gRPC method ${methodName}:`, error);
        
        // Record metrics
        const duration = Date.now() - startTime;
        grpcRequestsTotal.inc({ method: methodName, status: 'error' });
        grpcRequestDuration.observe({ method: methodName }, duration / 1000);
        
        // Convert error to gRPC error
        const grpcError = {
          code: error.code || grpc.status.INTERNAL,
          message: error.message || 'Internal server error'
        };
        
        callback(grpcError);
      }
    });
  };
}

/**
 * Start the gRPC server
 * @param {Object} options - Server options
 * @returns {Object} The gRPC server
 */
function startServer(options = {}) {
  const defaultOptions = {
    port: process.env.GRPC_PORT || 50051,
    host: process.env.GRPC_HOST || '0.0.0.0'
  };
  
  const serverOptions = { ...defaultOptions, ...options };
  
  // Create gRPC server
  const server = new grpc.Server();
  
  // Add the service
  server.addService(communicationService.CommunicationService.service, {
    // User management
    getUser: createMethodHandler(userService.getUser),
    listUsers: createMethodHandler(userService.listUsers),
    updateUserStatus: createMethodHandler(userService.updateUserStatus),
    
    // Message handling
    sendMessage: createMethodHandler(messageService.sendMessage),
    getMessages: createMethodHandler(messageService.getMessages),
    streamMessages: createMethodHandler(messageService.streamMessages),
    
    // Meeting management
    createMeeting: createMethodHandler(meetingService.createMeeting),
    joinMeeting: createMethodHandler(meetingService.joinMeeting),
    endMeeting: createMethodHandler(meetingService.endMeeting),
    listMeetings: createMethodHandler(meetingService.listMeetings),
    
    // Translation services
    translateText: createMethodHandler(translationService.translateText, false),
    translateMessage: createMethodHandler(translationService.translateMessage),
    detectLanguage: createMethodHandler(translationService.detectLanguage, false),
    
    // Platform integration
    connectPlatform: createMethodHandler(platformService.connectPlatform),
    disconnectPlatform: createMethodHandler(platformService.disconnectPlatform),
    getPlatformStatus: createMethodHandler(platformService.getPlatformStatus)
  });
  
  // Start the server
  const address = `${serverOptions.host}:${serverOptions.port}`;
  server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
      console.error('Failed to start gRPC server:', error);
      return;
    }
    
    server.start();
    console.log(`gRPC server running at ${address}`);
  });
  
  return server;
}

module.exports = {
  startServer
};
