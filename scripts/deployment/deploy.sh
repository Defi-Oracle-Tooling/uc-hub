#!/bin/bash
# Deployment script for UC-Hub

set -e

# Configuration
NAMESPACE="uc-hub"
ENVIRONMENT=${1:-staging}  # Default to staging if not specified

echo "Deploying UC-Hub to $ENVIRONMENT environment"

# Ensure kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
  echo "Error: kubectl is not configured or cannot connect to cluster"
  exit 1
fi

# Apply Kubernetes manifests
echo "Applying Kubernetes manifests..."
kubectl apply -f infra/kubernetes/namespace.yaml
kubectl apply -f infra/kubernetes/configmap-${ENVIRONMENT}.yaml
kubectl apply -f infra/kubernetes/secret-${ENVIRONMENT}.yaml
kubectl apply -f infra/kubernetes/deployment-${ENVIRONMENT}.yaml
kubectl apply -f infra/kubernetes/service.yaml
kubectl apply -f infra/kubernetes/ingress-${ENVIRONMENT}.yaml

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl rollout status deployment/uc-hub-backend -n $NAMESPACE
kubectl rollout status deployment/uc-hub-frontend -n $NAMESPACE

echo "Deployment to $ENVIRONMENT completed successfully"
