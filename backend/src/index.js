require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { createServer } = require('http');
const { execute, subscribe } = require('graphql');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const mongoose = require('mongoose');
const cors = require('cors');

const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const { setupWebSocketServer } = require('./websocket');
const { graphqlContext } = require('./middleware/auth');
const { formatGraphQLError } = require('./utils/errorHandler');

async function startServer() {
  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/uc-hub', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }

  // Initialize Express
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Create HTTP server
  const httpServer = createServer(app);

  // Set up WebSocket server
  const io = setupWebSocketServer(httpServer);

  // Create GraphQL schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create Apollo Server
  const apolloServer = new ApolloServer({
    schema,
    context: graphqlContext,
    formatError: formatGraphQLError,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              subscriptionServer.close();
            }
          };
        }
      }
    ],
  });

  // Set up subscription server
  const subscriptionServer = SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      async onConnect(connectionParams) {
        if (connectionParams.authorization) {
          const token = connectionParams.authorization.split(' ')[1];
          try {
            // Use the same authentication logic from graphqlContext
            const context = await graphqlContext({ 
              req: { headers: { authorization: `Bearer ${token}` } } 
            });
            return context;
          } catch (error) {
            console.error('Subscription authentication error:', error);
            throw new Error('Authentication failed');
          }
        }
        throw new Error('Missing auth token');
      },
    },
    { server: httpServer, path: '/graphql' }
  );

  // Start Apollo Server
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  // Health check route
  app.get('/', (req, res) => {
    res.send('UC-Hub API is running');
  });

  // Start HTTP server
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`GraphQL endpoint: http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}${apolloServer.graphqlPath}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
});
