# Facebook OAuth URL Fragment Fix

When using Facebook OAuth, Facebook adds a `#_=_` fragment to the redirect URL. This can cause issues when trying to extract the token from the URL and use it for subsequent API calls.

## Add this code to your frontend React component that handles OAuth redirects

```javascript
// In your OAuth result component
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const OAuthResultPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Remove the Facebook #_=_ hash if present
    if (window.location.hash === '#_=_') {
      // Try to extract token from URL before the hash
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      
      if (token) {
        // Clear the URL hash without refreshing the page
        if (history.replaceState) {
          const cleanUrl = window.location.href.split('#')[0];
          history.replaceState(null, null, cleanUrl);
        } else {
          // Fallback for older browsers
          window.location.hash = '';
        }
        
        // Store the token and continue with authentication
        localStorage.setItem('authToken', token);
        
        // If you're using a state management library like Redux or Context:
        // setAuthToken(token);
      }
    }
    
    // Normal OAuth result processing...
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const error = params.get('error');
    
    if (token) {
      // Store the token
      localStorage.setItem('authToken', token);
      // Redirect to dashboard or home
      navigate('/dashboard');
    } else if (error) {
      // Handle error
      navigate('/login', { state: { error: params.get('reason') || 'Authentication failed' } });
    }
  }, [location, navigate]);
  
  return (
    <div className="oauth-result">
      <p>Processing authentication result...</p>
    </div>
  );
};

export default OAuthResultPage;
```

## For pure JavaScript implementations

```javascript
// If you're using vanilla JS instead of React, add this to your OAuth result page
document.addEventListener('DOMContentLoaded', function() {
  // Remove the Facebook #_=_ hash if present
  if (window.location.hash === '#_=_') {
    // Try to extract token from URL before the hash
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      // Clear the URL hash without refreshing the page
      if (history.replaceState) {
        const cleanUrl = window.location.href.split('#')[0];
        history.replaceState(null, null, cleanUrl);
      } else {
        // Fallback for older browsers
        window.location.hash = '';
      }
      
      // Store the token
      localStorage.setItem('authToken', token);
    }
  }
  
  // Continue with normal processing...
});
```

## Using the token for API calls

After storing the token, make sure you're including it in all API requests:

```javascript
// Example API call with the token
const fetchUserProfile = async () => {
  try {
    const token = localStorage.getItem('authToken');
    
    if (!token) {
      throw new Error('No authentication token found');
    }
    
    const response = await fetch('https://your-api.example.com/auth/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch profile');
    }
    
    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
};
```