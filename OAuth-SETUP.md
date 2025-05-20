# OAuth Setup for Tawkee API

This document outlines how to set up OAuth authentication with Google and Facebook for the Tawkee API.

## Overview

Tawkee API supports multiple authentication methods:

1. **Standard JWT Authentication** - Username/password login 
2. **Google OAuth** - Sign in with Google
3. **Facebook OAuth** - Sign in with Facebook

Users can connect multiple authentication methods to the same account. For example, a user can create an account with a username/password and later connect their Google account to enable "Sign in with Google".

## Prerequisites

1. A Google Developer account and project
2. A Facebook Developer account and app
3. The Tawkee API running on a publicly accessible URL

## Step 1: Set up Environment Variables

Add the following environment variables to your `.env` file:

```
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=${OUR_ADDRESS}/auth/google/callback

# Facebook OAuth
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=${OUR_ADDRESS}/auth/facebook/callback

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://your-frontend-url.com
```

Replace the placeholder values with your actual OAuth credentials.

## Step 2: Setting up Google OAuth

1. Go to the [Google Developer Console](https://console.developers.google.com/)
2. Create a new project or select an existing one
3. Navigate to "Credentials" > "Create Credentials" > "OAuth Client ID"
4. Choose "Web application" as the application type
5. Add `${OUR_ADDRESS}/auth/google/callback` to the list of Authorized Redirect URIs
6. Copy the Client ID and Client Secret to your `.env` file

## Step 3: Setting up Facebook OAuth

1. Go to the [Facebook Developer Portal](https://developers.facebook.com/)
2. Create a new app or select an existing one
3. Add the "Facebook Login" product to your app
4. Under Facebook Login settings, add `${OUR_ADDRESS}/auth/facebook/callback` to the Valid OAuth Redirect URIs
5. Copy the App ID and App Secret to your `.env` file

## Step 4: Configure the Frontend

In your frontend application, create URLs that point to the OAuth endpoints:

```
// Google OAuth
const googleLoginUrl = `${API_URL}/auth/google`;

// Facebook OAuth
const facebookLoginUrl = `${API_URL}/auth/facebook`;
```

Create routes to handle OAuth callbacks:

### OAuth Result Route

```
// Route: /auth/oauth-result
// This will handle both successful authentication and errors/cancellations
const token = new URLSearchParams(window.location.search).get('token');
const error = new URLSearchParams(window.location.search).get('error');
const reason = new URLSearchParams(window.location.search).get('reason');

if (token) {
  // Success case - store the token in local storage or cookies
  localStorage.setItem('auth_token', token);
  // Redirect to the dashboard or home page
  window.location.href = '/dashboard';
} else if (error) {
  // Error or cancellation case
  if (error === 'access_denied') {
    // User cancelled the login
    showMessage('Login was cancelled.');
  } else {
    // Some other error occurred
    showMessage(`Login failed: ${reason || 'Unknown error'}`);
  }
  // Redirect to login page after showing the message
  setTimeout(() => {
    window.location.href = '/login';
  }, 3000);
}
```

## Step 5: Testing OAuth Integration

You can test the OAuth integration using the provided test script:

```bash
node scripts/test-oauth.js
```

## API Endpoints

### Authentication Endpoints

- **POST /auth/register** - Register a new user with email/password
- **POST /auth/login** - Login with email/password
- **POST /auth/logout** - Logout and invalidate token
- **GET /auth/profile** - Get the current user's profile information

### OAuth Endpoints

- **GET /auth/google** - Initiate Google OAuth login flow
- **GET /auth/google/callback** - Handle Google OAuth callback
- **GET /auth/facebook** - Initiate Facebook OAuth login flow
- **GET /auth/facebook/callback** - Handle Facebook OAuth callback (supports both success and error flows)

## Handling OAuth Errors and Cancellations

The Facebook OAuth callback endpoint now intelligently handles both successful authentications and errors/cancellations in a single unified flow:

1. When a user successfully authenticates with Facebook, they are redirected to:
   ```
   ${FRONTEND_URL}/auth/oauth-result?token=jwt_token_here
   ```

2. When a user cancels Facebook login or encounters an error, they are redirected to:
   ```
   ${FRONTEND_URL}/auth/oauth-result?error=access_denied&reason=user_denied
   ```

This unified approach provides a seamless user experience by:
- Avoiding error pages when users cancel login
- Using a single frontend route to handle all OAuth results
- Providing detailed error information for better user feedback

### Implementation Details

The backend intelligently detects cancellations by:
1. Checking for the presence of error query parameters in the callback URL
2. Directing users to the same frontend route with different parameters
3. Handling the OAuth flow entirely on the backend, with no need for special frontend handling

### Additional Security Considerations

For enhanced security in production environments, consider:

1. Implementing CSRF protection with the OAuth 2.0 state parameter
2. Using short-lived JWT tokens and refresh token rotation
3. Enabling HTTPS for all OAuth endpoints and redirects

### Profile Endpoint Response

The `/auth/profile` endpoint returns extended user information, including OAuth provider details:

```json
{
  "id": "user-uuid-here",
  "email": "user@example.com",
  "name": "John Doe",
  "workspaceId": "workspace-uuid-here",
  "firstName": "John",
  "lastName": "Doe",
  "avatar": "https://example.com/avatar.jpg",
  "provider": "google",
  "emailVerified": true
}
```

### Auth Providers Endpoint Response

The `/auth/auth-providers` endpoint returns information about the connected authentication methods:

```json
{
  "googleEnabled": true,
  "facebookEnabled": false,
  "passwordEnabled": true,
  "lastProvider": "google"
}
```

## OAuth Flow

1. User clicks the "Login with Google" or "Login with Facebook" button
2. User is redirected to the respective provider's authentication page
3. After successful authentication, the provider redirects back to our callback URL
4. Our API verifies the authentication, creates or updates the user, and generates a JWT token
5. The user is redirected to the frontend with the token
6. The frontend stores the token and uses it for subsequent API calls

## User Data

When a user logs in via OAuth, the following data is stored:

- Email address
- First and last name (if available)
- Profile picture (if available)
- Provider ID (Google ID or Facebook ID)
- Provider name ("google" or "facebook")

A workspace is automatically created for new users.