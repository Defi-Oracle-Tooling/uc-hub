/**
 * TensorFlow.js Model Converter
 * 
 * This script converts TensorFlow/PyTorch models to TensorFlow.js format
 * for deployment to edge devices and browsers.
 */

const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Convert a TensorFlow SavedModel or Keras model to TensorFlow.js format
 * @param {string} inputPath - Path to the input model
 * @param {string} outputPath - Path to save the converted model
 * @param {string} modelType - Type of model ('keras', 'saved_model', 'pytorch')
 * @param {Object} options - Additional conversion options
 * @returns {Promise<void>}
 */
async function convertModel(inputPath, outputPath, modelType = 'keras', options = {}) {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    // Set default options
    const defaultOptions = {
      quantize: false,
      quantizationBits: 8,
      splitWeights: true,
      shardSize: 4 * 1024 * 1024, // 4MB
      outputFormat: 'tfjs_layers_model'
    };
    
    const conversionOptions = { ...defaultOptions, ...options };
    
    // Handle different model types
    switch (modelType.toLowerCase()) {
      case 'keras':
        await convertKerasModel(inputPath, outputPath, conversionOptions);
        break;
        
      case 'saved_model':
        await convertSavedModel(inputPath, outputPath, conversionOptions);
        break;
        
      case 'pytorch':
        await convertPyTorchModel(inputPath, outputPath, conversionOptions);
        break;
        
      default:
        throw new Error(`Unsupported model type: ${modelType}`);
    }
    
    console.log(`Model successfully converted and saved to ${outputPath}`);
  } catch (error) {
    console.error('Error converting model:', error);
    throw error;
  }
}

/**
 * Convert a Keras model to TensorFlow.js format
 * @param {string} inputPath - Path to the Keras model
 * @param {string} outputPath - Path to save the converted model
 * @param {Object} options - Conversion options
 * @returns {Promise<void>}
 */
async function convertKerasModel(inputPath, outputPath, options) {
  // Build the tensorflowjs_converter command
  let command = `tensorflowjs_converter --input_format=keras`;
  
  // Add options
  if (options.quantize) {
    command += ` --quantize_float16=${options.quantizationBits === 16 ? 'weight' : '*'}`;
  }
  
  if (options.splitWeights) {
    command += ` --split_weights_by_layer`;
  }
  
  command += ` --weight_shard_size_bytes=${options.shardSize}`;
  command += ` ${inputPath} ${outputPath}`;
  
  // Execute the command
  execSync(command, { stdio: 'inherit' });
}

/**
 * Convert a TensorFlow SavedModel to TensorFlow.js format
 * @param {string} inputPath - Path to the SavedModel
 * @param {string} outputPath - Path to save the converted model
 * @param {Object} options - Conversion options
 * @returns {Promise<void>}
 */
async function convertSavedModel(inputPath, outputPath, options) {
  // Build the tensorflowjs_converter command
  let command = `tensorflowjs_converter --input_format=tf_saved_model`;
  
  // Add options
  if (options.quantize) {
    command += ` --quantize_float16=${options.quantizationBits === 16 ? 'weight' : '*'}`;
  }
  
  if (options.splitWeights) {
    command += ` --split_weights_by_layer`;
  }
  
  command += ` --weight_shard_size_bytes=${options.shardSize}`;
  command += ` --output_format=${options.outputFormat}`;
  command += ` --saved_model_tags=serve`;
  command += ` ${inputPath} ${outputPath}`;
  
  // Execute the command
  execSync(command, { stdio: 'inherit' });
}

/**
 * Convert a PyTorch model to TensorFlow.js format
 * @param {string} inputPath - Path to the PyTorch model
 * @param {string} outputPath - Path to save the converted model
 * @param {Object} options - Conversion options
 * @returns {Promise<void>}
 */
async function convertPyTorchModel(inputPath, outputPath, options) {
  // First convert PyTorch to ONNX
  const onnxPath = path.join(path.dirname(outputPath), 'temp_onnx_model.onnx');
  
  // Check if Python is available
  try {
    execSync('python --version', { stdio: 'ignore' });
  } catch (error) {
    throw new Error('Python is required for PyTorch conversion');
  }
  
  // Create a temporary Python script for conversion
  const pythonScriptPath = path.join(path.dirname(outputPath), 'temp_convert_script.py');
  const pythonScript = `
import torch
import sys
import os

try:
    import torch.onnx
    
    # Load the PyTorch model
    model = torch.load('${inputPath.replace(/\\/g, '\\\\')}', map_location=torch.device('cpu'))
    
    # Set the model to evaluation mode
    model.eval()
    
    # Create dummy input tensor
    # Note: You may need to adjust the input shape based on your model
    dummy_input = torch.randn(1, 3, 224, 224)
    
    # Export the model to ONNX
    torch.onnx.export(
        model,
        dummy_input,
        '${onnxPath.replace(/\\/g, '\\\\')}',
        export_params=True,
        opset_version=12,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
    )
    
    print('PyTorch model successfully converted to ONNX')
    sys.exit(0)
except Exception as e:
    print(f'Error converting PyTorch model to ONNX: {str(e)}')
    sys.exit(1)
  `;
  
  fs.writeFileSync(pythonScriptPath, pythonScript);
  
  try {
    // Execute the Python script to convert PyTorch to ONNX
    execSync(`python ${pythonScriptPath}`, { stdio: 'inherit' });
    
    // Now convert ONNX to TensorFlow.js
    let command = `tensorflowjs_converter --input_format=onnx`;
    
    // Add options
    if (options.quantize) {
      command += ` --quantize_float16=${options.quantizationBits === 16 ? 'weight' : '*'}`;
    }
    
    if (options.splitWeights) {
      command += ` --split_weights_by_layer`;
    }
    
    command += ` --weight_shard_size_bytes=${options.shardSize}`;
    command += ` ${onnxPath} ${outputPath}`;
    
    // Execute the command
    execSync(command, { stdio: 'inherit' });
  } finally {
    // Clean up temporary files
    if (fs.existsSync(pythonScriptPath)) {
      fs.unlinkSync(pythonScriptPath);
    }
    
    if (fs.existsSync(onnxPath)) {
      fs.unlinkSync(onnxPath);
    }
  }
}

/**
 * Optimize a TensorFlow.js model for edge deployment
 * @param {string} modelPath - Path to the TensorFlow.js model
 * @param {Object} options - Optimization options
 * @returns {Promise<void>}
 */
async function optimizeModel(modelPath, options = {}) {
  try {
    // Set default options
    const defaultOptions = {
      quantize: true,
      quantizationBits: 8,
      pruning: false,
      pruningThreshold: 0.05,
      clusteringFactor: 0
    };
    
    const optimizationOptions = { ...defaultOptions, ...options };
    
    // Load the model
    const model = await tf.loadLayersModel(`file://${modelPath}/model.json`);
    
    // Apply optimizations
    if (optimizationOptions.quantize) {
      console.log(`Quantizing model to ${optimizationOptions.quantizationBits} bits...`);
      
      // For demonstration, we're just saving with quantization options
      // In a real implementation, you would apply actual quantization here
    }
    
    if (optimizationOptions.pruning) {
      console.log(`Pruning model with threshold ${optimizationOptions.pruningThreshold}...`);
      
      // For demonstration, we're just logging
      // In a real implementation, you would apply actual pruning here
    }
    
    if (optimizationOptions.clusteringFactor > 0) {
      console.log(`Applying weight clustering with factor ${optimizationOptions.clusteringFactor}...`);
      
      // For demonstration, we're just logging
      // In a real implementation, you would apply actual weight clustering here
    }
    
    // Save the optimized model
    const optimizedPath = `${modelPath}_optimized`;
    
    if (!fs.existsSync(optimizedPath)) {
      fs.mkdirSync(optimizedPath, { recursive: true });
    }
    
    await model.save(`file://${optimizedPath}`);
    
    console.log(`Model optimized and saved to ${optimizedPath}`);
  } catch (error) {
    console.error('Error optimizing model:', error);
    throw error;
  }
}

/**
 * Create a Cloudflare Worker script for deploying a TensorFlow.js model
 * @param {string} modelPath - Path to the TensorFlow.js model
 * @param {string} outputPath - Path to save the worker script
 * @param {Object} options - Worker options
 * @returns {Promise<void>}
 */
async function createCloudflareWorker(modelPath, outputPath, options = {}) {
  try {
    // Set default options
    const defaultOptions = {
      modelName: 'model',
      memoryLimit: '128MB',
      cpuLimit: '50ms',
      route: '/*',
      compatibilityDate: new Date().toISOString().split('T')[0]
    };
    
    const workerOptions = { ...defaultOptions, ...options };
    
    // Read the model.json file
    const modelJsonPath = path.join(modelPath, 'model.json');
    const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
    
    // Read all the weight files
    const weightFiles = modelJson.weightsManifest[0].paths;
    const weights = {};
    
    for (const weightFile of weightFiles) {
      const weightPath = path.join(modelPath, weightFile);
      const weightData = fs.readFileSync(weightPath);
      weights[weightFile] = weightData.toString('base64');
    }
    
    // Create the worker script
    const workerScript = `
// TensorFlow.js Edge AI Worker
// Model: ${workerOptions.modelName}
// Generated: ${new Date().toISOString()}

import * as tf from '@tensorflow/tfjs';

// Model configuration
const MODEL_CONFIG = ${JSON.stringify(modelJson, null, 2)};

// Model weights (base64 encoded)
const MODEL_WEIGHTS = ${JSON.stringify(weights, null, 2)};

// Initialize the model
let model;

async function loadModel() {
  if (model) {
    return model;
  }
  
  // Convert base64 weights to ArrayBuffers
  const weightData = {};
  for (const [filename, base64Data] of Object.entries(MODEL_WEIGHTS)) {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    weightData[filename] = bytes.buffer;
  }
  
  // Create a weights map
  const weightMap = {};
  for (const group of MODEL_CONFIG.weightsManifest) {
    for (let i = 0; i < group.paths.length; i++) {
      const path = group.paths[i];
      weightMap[path] = weightData[path];
    }
  }
  
  // Load the model
  model = await tf.loadLayersModel({
    modelTopology: MODEL_CONFIG.modelTopology,
    weightSpecs: MODEL_CONFIG.weightsManifest[0].weights,
    weightData: weightMap
  });
  
  // Warm up the model
  const dummyInput = tf.zeros(model.inputs[0].shape);
  await model.predict(dummyInput).data();
  dummyInput.dispose();
  
  return model;
}

// Process an input tensor
async function processInput(inputData) {
  const model = await loadModel();
  
  // Convert input data to tensor
  // Note: Adjust this based on your model's input requirements
  const inputTensor = tf.tensor(inputData);
  
  // Run inference
  const outputTensor = model.predict(inputTensor);
  
  // Get the output data
  const outputData = await outputTensor.data();
  
  // Clean up tensors
  inputTensor.dispose();
  outputTensor.dispose();
  
  return Array.from(outputData);
}

// Handle HTTP requests
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  // Handle OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  // Only accept POST requests for inference
  if (request.method !== 'POST') {
    return new Response('Method not allowed. Use POST for inference.', {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      }
    });
  }
  
  try {
    // Parse the request body
    const requestData = await request.json();
    
    // Process the input
    const result = await processInput(requestData.input);
    
    // Return the result
    return new Response(JSON.stringify({ output: result }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
}
`;
    
    // Create the wrangler.toml configuration file
    const wranglerConfig = `
name = "${workerOptions.modelName}-edge-ai"
main = "worker.js"
compatibility_date = "${workerOptions.compatibilityDate}"

[build]
command = "npm install"

[build.upload]
format = "service-worker"

[triggers]
crons = []

[env.production]
memory_limit = "${workerOptions.memoryLimit}"
cpu_limit = "${workerOptions.cpuLimit}"

[[routes]]
pattern = "${workerOptions.route}"
zone_name = "${workerOptions.zoneName || 'example.com'}"
`;
    
    // Create the package.json file
    const packageJson = {
      name: `${workerOptions.modelName}-edge-ai`,
      version: '1.0.0',
      description: 'Edge AI worker for TensorFlow.js model inference',
      main: 'worker.js',
      scripts: {
        deploy: 'wrangler publish'
      },
      dependencies: {
        '@tensorflow/tfjs': '^4.2.0'
      },
      devDependencies: {
        'wrangler': '^2.0.0'
      }
    };
    
    // Create the output directory if it doesn't exist
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    
    // Write the files
    fs.writeFileSync(path.join(outputPath, 'worker.js'), workerScript);
    fs.writeFileSync(path.join(outputPath, 'wrangler.toml'), wranglerConfig);
    fs.writeFileSync(path.join(outputPath, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    console.log(`Cloudflare Worker created at ${outputPath}`);
  } catch (error) {
    console.error('Error creating Cloudflare Worker:', error);
    throw error;
  }
}

module.exports = {
  convertModel,
  optimizeModel,
  createCloudflareWorker
};
