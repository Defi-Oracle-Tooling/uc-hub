require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('config');
const { typeDefs } = require('./schema');
const { resolvers, verifySubscriptionAuth } = require('./resolvers');
const WebSocketHandler = require('./websocket');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./utils/errorHandler');

async function startApolloServer() {
  const app = express();
  const httpServer = createServer(app);

  // Set up WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Create schema for both HTTP and WebSocket servers
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Set up WebSocket subscription server with auth
  const serverCleanup = useServer({
    schema,
    context: async (ctx) => {
      // Get the token from the connection params
      const token = ctx.connectionParams?.authToken;
      if (token) {
        try {
          // Verify and get user context
          const { user } = await verifySubscriptionAuth({ authToken: token });
          return { user };
        } catch (error) {
          console.error('Subscription authentication error:', error);
          throw error;
        }
      }
      throw new Error('Missing auth token');
    },
  }, wsServer);

  // Initialize custom WebSocket handler for real-time features
  const webSocketHandler = new WebSocketHandler(httpServer);

  // Create Apollo Server
  const server = new ApolloServer({
    schema,
    plugins: [
      // Proper shutdown for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    context: async ({ req }) => {
      // Get user from auth middleware
      const user = req.user;
      return {
        user,
        webSocketHandler,
      };
    },
  });

  await server.start();

  // Apply middlewares
  app.use(cors());
  app.use(express.json());
  app.use(authMiddleware);

  // Mount Apollo Server middleware
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: req.user,
        webSocketHandler,
      }),
    })
  );

  // Error handling
  app.use(errorHandler);

  // Connect to MongoDB
  const mongoUri = config.get('mongoURI');
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }

  // Start the server
  const PORT = process.env.PORT || 4000;
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`🚀 Server ready at http://localhost:${PORT}/graphql`);
  console.log(`🚀 WebSocket server ready at ws://localhost:${PORT}/graphql`);
}

startApolloServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
