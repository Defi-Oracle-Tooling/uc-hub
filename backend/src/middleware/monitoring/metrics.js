/**
 * Prometheus Metrics Middleware
 * 
 * This middleware collects and exposes Prometheus metrics for the backend services.
 */

const promClient = require('prom-client');
const express = require('express');

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'uc-hub-backend'
});

// Enable the collection of default metrics
promClient.collectDefaultMetrics({ register });

// Create custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});

const graphqlResolverDuration = new promClient.Histogram({
  name: 'graphql_resolver_duration_ms',
  help: 'Duration of GraphQL resolvers in ms',
  labelNames: ['operation', 'field'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});

const graphqlErrors = new promClient.Counter({
  name: 'graphql_errors_total',
  help: 'Total number of GraphQL errors',
  labelNames: ['operation', 'error_type']
});

const activeConnections = new promClient.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});

const messagesSent = new promClient.Counter({
  name: 'messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['platform']
});

const messagesReceived = new promClient.Counter({
  name: 'messages_received_total',
  help: 'Total number of messages received',
  labelNames: ['platform']
});

const translationRequests = new promClient.Counter({
  name: 'translation_requests_total',
  help: 'Total number of translation requests',
  labelNames: ['source_language', 'target_language']
});

const translationDuration = new promClient.Histogram({
  name: 'translation_duration_ms',
  help: 'Duration of translation requests in ms',
  labelNames: ['source_language', 'target_language'],
  buckets: [5, 15, 50, 100, 250, 500, 1000]
});

const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type']
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type']
});

// Register custom metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(graphqlResolverDuration);
register.registerMetric(graphqlErrors);
register.registerMetric(activeConnections);
register.registerMetric(messagesSent);
register.registerMetric(messagesReceived);
register.registerMetric(translationRequests);
register.registerMetric(translationDuration);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);

/**
 * HTTP middleware to collect metrics for each request
 */
const httpMetricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Record the end of the request
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Extract route pattern from the route stack
    let route = req.originalUrl;
    if (req.route && req.route.path) {
      route = req.route.path;
    }
    
    // Record HTTP request duration
    httpRequestDurationMicroseconds.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode
      },
      duration
    );
  });
  
  next();
};

/**
 * GraphQL plugin to collect metrics for resolvers
 */
const graphqlMetricsPlugin = {
  requestDidStart() {
    return {
      didResolveOperation(context) {
        const operationName = context.operationName || 'anonymous';
        context.metrics = { operationName };
      },
      
      executionDidStart() {
        return {
          willResolveField({ context, info }) {
            const start = Date.now();
            
            return () => {
              const duration = Date.now() - start;
              const operationName = context.metrics?.operationName || 'anonymous';
              
              graphqlResolverDuration.observe(
                {
                  operation: operationName,
                  field: `${info.parentType.name}.${info.fieldName}`
                },
                duration
              );
            };
          }
        };
      },
      
      didEncounterErrors(context) {
        const operationName = context.metrics?.operationName || 'anonymous';
        
        context.errors.forEach(error => {
          graphqlErrors.inc({
            operation: operationName,
            error_type: error.extensions?.code || 'UNKNOWN'
          });
        });
      }
    };
  }
};

/**
 * Create an Express router to expose the metrics endpoint
 */
const metricsRouter = express.Router();

metricsRouter.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error.message);
  }
});

module.exports = {
  register,
  httpRequestDurationMicroseconds,
  graphqlResolverDuration,
  graphqlErrors,
  activeConnections,
  messagesSent,
  messagesReceived,
  translationRequests,
  translationDuration,
  cacheHits,
  cacheMisses,
  httpMetricsMiddleware,
  graphqlMetricsPlugin,
  metricsRouter
};
