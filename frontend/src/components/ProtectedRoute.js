import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery, gql } from '@apollo/client';
import jwt_decode from 'jwt-decode';

const GET_CURRENT_USER = gql`
  query GetCurrentUser {
    getCurrentUser {
      id
      name
      email
      role
    }
  }
`;

/**
 * Protected Route Component
 * Ensures routes are only accessible by authenticated users
 * Also handles token refresh if token is expired
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');

  // Check if token exists and is not expired
  const isTokenValid = () => {
    if (!token) return false;
    
    try {
      const decoded = jwt_decode(token);
      return decoded.exp * 1000 > Date.now();
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  };

  // Handle token refresh if needed
  useEffect(() => {
    const handleTokenRefresh = async () => {
      if (token && refreshToken && !isTokenValid()) {
        try {
          const response = await fetch('/api/auth/refresh-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          });
          
          if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.accessToken);
          } else {
            // If refresh token is invalid, logout user
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
          }
        } catch (error) {
          console.error('Token refresh error:', error);
        }
      }
    };
    
    handleTokenRefresh();
  }, [token, refreshToken, location.pathname]);

  // Verify current user with backend if token exists
  const { loading, error } = useQuery(GET_CURRENT_USER, {
    skip: !token || !isTokenValid(),
    onError: () => {
      // If API returns an error, clear tokens and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  });

  // If no token or invalid token, redirect to login
  if (!token || !isTokenValid()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Show loading state while verifying
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // If there was an error but we haven't redirected yet
  if (error) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If we have a valid token and verified user, render the protected content
  return children;
};

export default ProtectedRoute;
