#!/bin/bash
# Helper script for running tests in CI environment

set -e

# Configuration
TEST_TYPE=${1:-all}  # Options: all, unit, integration, e2e
COVERAGE=${2:-false}

echo "Running $TEST_TYPE tests with coverage=$COVERAGE"

# Function to run backend tests
run_backend_tests() {
  echo "Running backend tests..."
  cd backend
  
  if [ "$COVERAGE" = "true" ]; then
    npm test -- --coverage --passWithNoTests
  else
    npm test -- --passWithNoTests
  fi
  
  cd ..
}

# Function to run frontend tests
run_frontend_tests() {
  echo "Running frontend tests..."
  cd frontend
  
  if [ "$COVERAGE" = "true" ]; then
    npm test -- --coverage --passWithNoTests
  else
    npm test -- --passWithNoTests
  fi
  
  cd ..
}

# Function to run integration tests
run_integration_tests() {
  echo "Running integration tests..."
  # Add integration test commands here
  echo "Integration tests not implemented yet"
}

# Function to run end-to-end tests
run_e2e_tests() {
  echo "Running end-to-end tests..."
  # Add e2e test commands here
  echo "E2E tests not implemented yet"
}

# Run tests based on the specified type
case $TEST_TYPE in
  "all")
    run_backend_tests
    run_frontend_tests
    run_integration_tests
    run_e2e_tests
    ;;
  "unit")
    run_backend_tests
    run_frontend_tests
    ;;
  "integration")
    run_integration_tests
    ;;
  "e2e")
    run_e2e_tests
    ;;
  *)
    echo "Invalid test type: $TEST_TYPE"
    echo "Valid options: all, unit, integration, e2e"
    exit 1
    ;;
esac

echo "Tests completed successfully"
