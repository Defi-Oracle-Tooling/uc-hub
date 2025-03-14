#!/bin/bash
# Script to set up Prometheus monitoring for UC-Hub

set -e

# Configuration
NAMESPACE="monitoring"
PROMETHEUS_VERSION="v2.40.0"

echo "Setting up Prometheus monitoring for UC-Hub"

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply Prometheus operator CRDs
echo "Applying Prometheus operator CRDs..."
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/$PROMETHEUS_VERSION/example/prometheus-operator-crd/monitoring.coreos.com_alertmanagers.yaml
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/$PROMETHEUS_VERSION/example/prometheus-operator-crd/monitoring.coreos.com_prometheuses.yaml
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/$PROMETHEUS_VERSION/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Apply Prometheus configuration
echo "Applying Prometheus configuration..."
kubectl apply -f infra/prometheus/prometheus.yaml
kubectl apply -f infra/prometheus/service-monitor.yaml

# Apply Grafana configuration
echo "Applying Grafana configuration..."
kubectl apply -f infra/grafana/deployment.yaml
kubectl apply -f infra/grafana/service.yaml
kubectl apply -f infra/grafana/configmap.yaml

echo "Waiting for deployments to be ready..."
kubectl rollout status deployment/prometheus -n $NAMESPACE
kubectl rollout status deployment/grafana -n $NAMESPACE

echo "Prometheus and Grafana setup completed successfully"
echo "Grafana can be accessed at: http://grafana.uc-hub.local"
echo "Prometheus can be accessed at: http://prometheus.uc-hub.local"
