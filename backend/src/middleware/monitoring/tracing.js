/**
 * OpenTelemetry Tracing Middleware
 * 
 * This middleware provides distributed tracing functionality using OpenTelemetry.
 */

const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { trace, context } = require('@opentelemetry/api');

// Initialize OpenTelemetry SDK
function initializeTracing() {
  const serviceName = process.env.SERVICE_NAME || 'uc-hub-backend';
  const environment = process.env.ENVIRONMENT || 'development';
  
  // Configure the trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: process.env.OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces'
  });
  
  // Create a resource that identifies your service
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment
  });
  
  // Create and register the SDK
  const sdk = new opentelemetry.NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [getNodeAutoInstrumentations()]
  });
  
  // Initialize the SDK and register with the OpenTelemetry API
  sdk.start()
    .then(() => console.log('Tracing initialized'))
    .catch((error) => console.error('Error initializing tracing', error));
  
  // Gracefully shut down the SDK on process exit
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
  
  return sdk;
}

/**
 * Create a custom span for a specific operation
 * @param {string} name - The name of the span
 * @param {Object} attributes - Span attributes
 * @param {Function} callback - The function to execute within the span
 * @returns {Promise<any>} The result of the callback
 */
async function createSpan(name, attributes, callback) {
  const tracer = trace.getTracer('uc-hub-tracer');
  
  return await tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await callback();
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: opentelemetry.SpanStatusCode.ERROR });
      span.end();
      throw error;
    }
  });
}

/**
 * Express middleware to add trace context to the request
 */
function expressMiddleware(req, res, next) {
  const tracer = trace.getTracer('uc-hub-tracer');
  
  tracer.startActiveSpan(`HTTP ${req.method} ${req.path}`, async (span) => {
    // Add HTTP request details to the span
    span.setAttributes({
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.host': req.headers.host,
      'http.user_agent': req.headers['user-agent'],
      'http.request_content_length': req.headers['content-length'],
      'http.flavor': req.httpVersion
    });
    
    // Store the span in the request for later use
    req.span = span;
    
    // Add trace context to the response headers
    const responseHeaders = {};
    
    // Capture the response
    const originalEnd = res.end;
    res.end = function(...args) {
      // Add HTTP response details to the span
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_content_length': res.getHeader('content-length')
      });
      
      // Set span status based on the HTTP status code
      if (res.statusCode >= 400) {
        span.setStatus({
          code: opentelemetry.SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`
        });
      }
      
      span.end();
      return originalEnd.apply(this, args);
    };
    
    next();
  });
}

/**
 * GraphQL plugin to add tracing to resolvers
 */
const graphqlPlugin = {
  requestDidStart() {
    return {
      didResolveOperation(context) {
        const tracer = trace.getTracer('uc-hub-tracer');
        const operationName = context.operationName || 'anonymous';
        const operationType = context.operation.operation;
        
        // Create a span for the GraphQL operation
        const span = tracer.startSpan(`GraphQL ${operationType} ${operationName}`, {
          attributes: {
            'graphql.operation.name': operationName,
            'graphql.operation.type': operationType
          }
        });
        
        // Store the span in the context for later use
        context.span = span;
      },
      
      executionDidStart({ context }) {
        return {
          willResolveField({ context, info }) {
            const tracer = trace.getTracer('uc-hub-tracer');
            const fieldName = `${info.parentType.name}.${info.fieldName}`;
            
            // Create a span for the resolver
            const span = tracer.startSpan(`GraphQL resolve ${fieldName}`, {
              attributes: {
                'graphql.field.name': info.fieldName,
                'graphql.field.path': info.path.key,
                'graphql.field.parent': info.parentType.name
              }
            });
            
            return () => {
              span.end();
            };
          }
        };
      },
      
      didEncounterErrors({ context, errors }) {
        if (context.span) {
          // Record errors in the operation span
          errors.forEach(error => {
            context.span.recordException(error);
          });
          
          context.span.setStatus({
            code: opentelemetry.SpanStatusCode.ERROR,
            message: errors[0].message
          });
        }
      },
      
      willSendResponse({ context }) {
        if (context.span) {
          context.span.end();
        }
      }
    };
  }
};

/**
 * Add structured logging with trace correlation
 * @param {Object} logger - The logger instance
 * @returns {Object} Enhanced logger with trace correlation
 */
function enhanceLoggerWithTracing(logger) {
  const enhancedLogger = {};
  
  // Enhance each log level
  ['debug', 'info', 'warn', 'error'].forEach(level => {
    enhancedLogger[level] = (message, ...args) => {
      const currentSpan = trace.getSpan(context.active());
      
      if (currentSpan) {
        const spanContext = currentSpan.spanContext();
        
        // Add trace context to the log
        const traceInfo = {
          'trace_id': spanContext.traceId,
          'span_id': spanContext.spanId
        };
        
        // Merge trace info with other log data
        if (args.length > 0 && typeof args[args.length - 1] === 'object') {
          args[args.length - 1] = { ...args[args.length - 1], ...traceInfo };
        } else {
          args.push(traceInfo);
        }
      }
      
      return logger[level](message, ...args);
    };
  });
  
  return enhancedLogger;
}

module.exports = {
  initializeTracing,
  createSpan,
  expressMiddleware,
  graphqlPlugin,
  enhanceLoggerWithTracing
};
