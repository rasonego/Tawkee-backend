# Architecture Overview

## 1. Overview

The repository contains a WhatsApp automation platform built with NestJS, providing AI-powered conversation capabilities. The system, named "Tawkee API", allows businesses to create AI agents that can interact with customers through WhatsApp, using OpenAI's language models for generating responses.

The application follows a modular architecture with clear separation of concerns, utilizing NestJS's module system. It provides RESTful APIs for managing workspaces, agents, conversations, and WhatsApp integrations.

## 2. System Architecture

### Backend Architecture

The system is built using NestJS, a progressive Node.js framework for building server-side applications. The architecture follows these key principles:

- **Modular Design**: The application is structured into feature modules, each responsible for a specific domain of functionality
- **Dependency Injection**: NestJS's DI system is used for managing service dependencies
- **Controller-Service Pattern**: Each module typically consists of a controller for handling HTTP requests and a service for business logic
- **Repository Pattern**: Prisma ORM is used to abstract database operations

### Database Architecture

The application uses PostgreSQL as its primary database, accessed through Prisma ORM. The schema appears to include these main entities:

- Workspaces
- Users (with authentication)
- Agents (AI assistants)
- Chats
- Messages
- Channels (WhatsApp integrations)
- Trainings (for AI model training)
- Intentions (for defining agent behaviors)
- Interactions (tracking conversations)

### Authentication Architecture

The application implements JWT-based authentication:

- JWT tokens are issued upon user login
- An AuthGuard middleware protects API endpoints
- Token verification ensures secure access to protected resources

### Integration Architecture

The system integrates with several external services:

- **Evolution API**: For WhatsApp messaging capabilities
- **OpenAI API**: For generating AI responses to customer messages

## 3. Key Components

### Core Modules

1. **Workspaces Module**
   - Manages workspaces which contain agents, users, and other resources
   - Handles workspace credits and subscription status

2. **Users Module**
   - Manages user authentication and authorization
   - Handles user registration, login, and profile information

3. **Agents Module**
   - Manages AI agents that respond to customer inquiries
   - Allows configuration of agent behavior, communication style, and type

4. **Channels Module**
   - Manages communication channels, primarily WhatsApp
   - Handles QR code generation for WhatsApp connection

5. **Conversations Module**
   - Processes incoming messages and generates AI responses
   - Manages conversation context and message history

6. **Webhooks Module**
   - Receives and processes webhook events from Evolution API (WhatsApp service)
   - Routes messages to appropriate agents

7. **OpenAI Module**
   - Interfaces with OpenAI's API to generate responses
   - Handles different AI models (GPT-4, GPT-3.5, etc.)

8. **Evolution API Module**
   - Integrates with Evolution API for WhatsApp connectivity
   - Handles sending and receiving WhatsApp messages

9. **Trainings Module**
   - Manages training materials for AI agents
   - Supports different training types (text, website, etc.)

10. **Intentions Module**
    - Defines structured actions agents can take (like calling webhooks)
    - Used for workflow automation

### Common Components

1. **Prisma Module**
   - Provides database access through Prisma ORM
   - Used globally throughout the application

2. **Auth Module**
   - Provides authentication and authorization services
   - Implements JWT token verification

3. **Common Utilities**
   - Response transformers
   - Exception filters
   - Pagination utilities
   - Communication guides for AI responses

## 4. Data Flow

### Incoming Message Flow

1. WhatsApp messages are received through Evolution API webhooks
2. Webhook events are processed by the `WebhooksController`
3. Messages are routed to the appropriate agent based on the WhatsApp instance
4. The agent's context and training are used to generate an AI response via OpenAI
5. The response is sent back to the user through Evolution API

### Agent Creation Flow

1. User creates a workspace (or uses an existing one)
2. User creates an agent with specific behavior, communication style, and type
3. User can add training materials to improve agent responses
4. User connects the agent to a WhatsApp channel by scanning a QR code
5. The agent is now ready to interact with customers through WhatsApp

### Authentication Flow

The system supports multiple authentication methods:

1. **Standard JWT Authentication**:
   - User registers or logs in through the Auth endpoints
   - The system issues a JWT token upon successful authentication
   - The token is used for subsequent API calls
   - Protected endpoints verify the token using the AuthGuard

2. **OAuth Authentication (Google and Facebook)**:
   - User initiates OAuth login by accessing /auth/google or /auth/facebook
   - User is redirected to the provider's authentication page
   - Upon successful authentication, the provider redirects back to our callback endpoint
   - The system creates or updates the user record with OAuth profile information
   - A JWT token is generated and the user is redirected to the frontend
   - Frontend stores the token for subsequent API calls
   - Protected endpoints verify the token using the same AuthGuard

## 5. External Dependencies

### Primary Dependencies

1. **OpenAI API**
   - Used for generating AI responses
   - Requires an API key (OPENAI_API_KEY)

2. **Evolution API**
   - WhatsApp integration service
   - Requires server URL (EVOLUTION_API_URL) and API key (EVOLUTION_API_KEY)

3. **Google OAuth API**
   - Used for "Sign in with Google" functionality
   - Requires client ID (GOOGLE_CLIENT_ID) and client secret (GOOGLE_CLIENT_SECRET)

4. **Facebook OAuth API**
   - Used for "Sign in with Facebook" functionality
   - Requires app ID (FACEBOOK_APP_ID) and app secret (FACEBOOK_APP_SECRET)

### Developer Dependencies

1. **NestJS Framework** (v11)
   - Core framework for backend development

2. **Prisma ORM** (v6)
   - Database access and schema management

3. **JWT** (via @nestjs/jwt)
   - Authentication and token management

4. **Swagger** (via @nestjs/swagger)
   - API documentation

5. **Class Validator & Class Transformer**
   - Request validation and object transformation

## 6. Deployment Strategy

The application is configured for deployment on Zeep Code, as indicated by the `.Zeep Code` configuration file. The deployment process includes:

1. Database schema synchronization (`npx prisma db pull`)
2. Prisma client generation (`npx prisma generate`)
3. Application build (`npm run build`)
4. Running the compiled application (`node dist/main.js`)

The application exposes two ports:
- Port 5000: Main application (mapped to external port 80)
- Port 5555: Additional port, likely for Prisma Studio (mapped to external port 3000)

Environment configuration is managed through `.env` files, with sensitive information like API keys stored as environment variables.

## 7. API Structure

The API follows RESTful principles and is organized around resources:

- **Auth**: `/auth/*` - User registration, login, and profile management
- **Workspaces**: `/workspaces/*` - Workspace management and credits
- **Agents**: `/workspace/:workspaceId/agents/*` - Agent CRUD operations
- **Channels**: `/agent/:agentId/search` - Channel management for WhatsApp
- **Trainings**: `/agent/:agentId/trainings/*` - Training material management
- **Intentions**: `/agent/:agentId/intentions/*` - Intention management
- **Conversations**: `/agent/:agentId/conversation` - Conversation handling
- **Interactions**: `/workspace/:workspaceId/interactions/*` - Interaction monitoring
- **Webhooks**: `/webhooks/*` - Webhook endpoints for Evolution API

The API is documented using Swagger, accessible at the `/api` endpoint.

## 8. Scaling Considerations

The architecture supports horizontal scaling with stateless services:

- JWT authentication allows for stateless authentication across multiple instances
- PostgreSQL database provides persistent storage
- External integrations (OpenAI, Evolution API) can be accessed from any instance

To scale the application:
1. Deploy multiple instances of the NestJS application
2. Use a load balancer to distribute requests
3. Ensure the PostgreSQL database is properly scaled and optimized
4. Monitor API rate limits for external services (OpenAI, Evolution API)

## 9. Security Considerations

The application implements several security measures:

1. **Authentication**: JWT-based authentication with token expiration
2. **Input Validation**: Request validation using class-validator
3. **Webhook Verification**: Token-based verification for incoming webhooks
4. **Environment Isolation**: Sensitive configuration in environment variables
5. **Error Handling**: Custom exception filters to prevent information leakage

Additional security measures could include:
- Rate limiting
- CORS configuration (currently enabled but not strictly configured)
- API key rotation policies