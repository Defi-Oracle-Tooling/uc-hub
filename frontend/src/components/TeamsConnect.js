import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { gql } from '@apollo/client';

const GET_TEAMS_AUTH_URL = gql`
  query GetTeamsAuthUrl {
    teamsAuthUrl
  }
`;

const GET_TEAMS_CONNECTION_STATUS = gql`
  query GetTeamsConnectionStatus {
    teamsConnectionStatus {
      isConnected
      email
      name
    }
  }
`;

const CONNECT_TEAMS = gql`
  mutation ConnectTeams($code: String!, $state: String!) {
    connectTeams(code: $code, state: $state) {
      success
      error
    }
  }
`;

const DISCONNECT_TEAMS = gql`
  mutation DisconnectTeams {
    disconnectTeams
  }
`;

const TeamsConnect = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Get Teams connection status
  const { data: statusData, loading: statusLoading, refetch: refetchStatus } = useQuery(
    GET_TEAMS_CONNECTION_STATUS
  );

  // Get Teams auth URL
  const { data: urlData } = useQuery(GET_TEAMS_AUTH_URL);

  // Mutations for connecting/disconnecting Teams
  const [connectTeams] = useMutation(CONNECT_TEAMS);
  const [disconnectTeams] = useMutation(DISCONNECT_TEAMS);

  // Handle OAuth redirect
  useEffect(() => {
    const handleOAuthRedirect = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state) {
        setIsConnecting(true);
        setError(null);

        try {
          const { data } = await connectTeams({
            variables: { code, state }
          });

          if (data.connectTeams.success) {
            await refetchStatus();
            // Clear URL parameters
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            setError(data.connectTeams.error || 'Failed to connect to Teams');
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setIsConnecting(false);
        }
      }
    };

    handleOAuthRedirect();
  }, [connectTeams, refetchStatus]);

  const handleConnect = () => {
    if (urlData?.teamsAuthUrl) {
      window.location.href = urlData.teamsAuthUrl;
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectTeams();
      await refetchStatus();
    } catch (err) {
      setError(err.message);
    }
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const { isConnected, email, name } = statusData?.teamsConnectionStatus || {};

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Microsoft Teams Integration</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {isConnected ? (
        <div>
          <div className="mb-4">
            <p className="text-green-600 font-medium flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Connected to Teams
            </p>
            <p className="text-gray-600 mt-2">
              Connected as: {name || email}
            </p>
          </div>

          <button
            onClick={handleDisconnect}
            className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Disconnect from Teams
          </button>
        </div>
      ) : (
        <div>
          <p className="text-gray-600 mb-4">
            Connect your Microsoft Teams account to enable cross-platform messaging and meeting integration.
          </p>

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-[#464EB8] text-white px-4 py-2 rounded-md hover:bg-[#373CA8] focus:outline-none focus:ring-2 focus:ring-[#464EB8] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                Connect to Teams
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamsConnect;