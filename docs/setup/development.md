# UC-Hub Development Setup Guide

This guide provides instructions for setting up a development environment for the UC-Hub project.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or later)
- **npm** (v7 or later)
- **Docker** and **Docker Compose**
- **PostgreSQL** (v13 or later)
- **Redis** (v6 or later)
- **Python** (v3.8 or later) for AI models
- **Git**

## Clone the Repository

```bash
git clone https://github.com/Defi-Oracle-Tooling/uc-hub.git
cd uc-hub
```

## Backend Setup

### Install Dependencies

```bash
cd backend
npm install
```

### Environment Configuration

Create a `.env` file in the `backend` directory with the following content:

```
# Server Configuration
PORT=4000
NODE_ENV=development
LOG_LEVEL=debug

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uc_hub
DB_USER=postgres
DB_PASSWORD=postgres

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=1d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Platform API Keys
TEAMS_CLIENT_ID=your_teams_client_id
TEAMS_CLIENT_SECRET=your_teams_client_secret
TEAMS_TENANT_ID=your_teams_tenant_id

WHATSAPP_API_KEY=your_whatsapp_api_key
WHATSAPP_API_SECRET=your_whatsapp_api_secret
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id

ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
ZOOM_ACCOUNT_ID=your_zoom_account_id

GOOGLE_MEET_CLIENT_ID=your_google_meet_client_id
GOOGLE_MEET_CLIENT_SECRET=your_google_meet_client_secret
GOOGLE_MEET_PROJECT_ID=your_google_meet_project_id

SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# AI Model Configuration
AI_TRANSLATION_MODEL_PATH=../ai-models/translation/models
AI_SPEECH_TO_TEXT_MODEL_PATH=../ai-models/speech-to-text/models
AI_VOICE_CLONING_MODEL_PATH=../ai-models/voice-cloning/models
AI_MEETING_SUMMARY_MODEL_PATH=../ai-models/meeting-summary/models

# WebRTC Configuration
SIGNALING_SERVER_PORT=4001
TURN_SERVER_URI=turn:localhost:3478
TURN_SERVER_USERNAME=username
TURN_SERVER_PASSWORD=password

# Security Configuration
ENABLE_2FA=false
ENCRYPTION_KEY=your_encryption_key
OAUTH_CALLBACK_URL=http://localhost:3000/auth/callback
```

Replace the placeholder values with your actual API keys and secrets.

### Database Setup

Create the PostgreSQL database:

```bash
createdb uc_hub
```

Run the database migrations:

```bash
npm run db:migrate
```

Seed the database with sample data (optional):

```bash
npm run db:seed
```

### Start the Backend Server

```bash
npm run dev
```

The GraphQL API will be available at `http://localhost:4000/graphql`.
The gRPC server will be available at `localhost:50051`.

## Frontend Setup

### Install Dependencies

```bash
cd frontend
npm install
```

### Environment Configuration

Create a `.env` file in the `frontend` directory with the following content:

```
REACT_APP_API_URL=http://localhost:4000
REACT_APP_GRAPHQL_URL=http://localhost:4000/graphql
REACT_APP_WEBSOCKET_URL=ws://localhost:4000/graphql
REACT_APP_SIGNALING_SERVER_URL=ws://localhost:4001
```

### Start the Frontend Server

```bash
npm start
```

The frontend will be available at `http://localhost:3000`.

## AI Models Setup

### Install Python Dependencies

```bash
cd ai-models
pip install -r requirements.txt
```

### Download Pre-trained Models

```bash
cd scripts
./download_models.sh
```

This script will download the pre-trained models for translation, speech-to-text, voice cloning, and meeting summary.

## Docker Setup (Alternative)

You can also use Docker to set up the entire development environment:

```bash
docker-compose up -d
```

This will start the following services:

- Backend API (GraphQL + gRPC)
- Frontend
- PostgreSQL
- Redis
- AI Models Service
- Kong API Gateway

## Running Tests

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### End-to-End Tests

```bash
npm run test:e2e
```

## Linting and Formatting

### Backend

```bash
cd backend
npm run lint
npm run format
```

### Frontend

```bash
cd frontend
npm run lint
npm run format
```

## Development Workflow

1. Create a new branch for your feature or bug fix:

```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit them:

```bash
git add .
git commit -m "Your commit message"
```

3. Push your changes to the remote repository:

```bash
git push origin feature/your-feature-name
```

4. Create a pull request on GitHub.

## Troubleshooting

### Database Connection Issues

If you encounter database connection issues, ensure that:

- PostgreSQL is running
- The database credentials in the `.env` file are correct
- The database exists

### Redis Connection Issues

If you encounter Redis connection issues, ensure that:

- Redis is running
- The Redis credentials in the `.env` file are correct

### AI Models Issues

If you encounter issues with AI models, ensure that:

- The required models are downloaded
- Python dependencies are installed
- The model paths in the `.env` file are correct

### WebRTC Issues

If you encounter WebRTC issues, ensure that:

- The signaling server is running
- The TURN server is configured correctly
- The browser has permission to access the camera and microphone

## Additional Resources

- [GraphQL API Documentation](../api/graphql.md)
- [gRPC API Documentation](../api/grpc.md)
- [Architecture Overview](../architecture/overview.md)
- [Security Features](../architecture/security.md)
- [Platform Integrations](../integrations/overview.md)
- [AI Features](../ai/overview.md)
