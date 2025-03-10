import React, { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import TeamsConnect from '../components/TeamsConnect';

const GET_USER_PREFERENCES = gql`
  query GetUserPreferences {
    me {
      id
      name
      email
      preferences {
        defaultPlatform
        language
        notificationsEnabled
        theme
      }
    }
  }
`;

const UPDATE_USER_PREFERENCES = gql`
  mutation UpdateUserPreferences($preferences: UserPreferencesInput!) {
    updateUserPreferences(preferences: $preferences) {
      id
      preferences {
        defaultPlatform
        language
        notificationsEnabled
        theme
      }
    }
  }
`;

const Settings = () => {
  const { data, loading } = useQuery(GET_USER_PREFERENCES);
  const [updatePreferences] = useMutation(UPDATE_USER_PREFERENCES);
  const [success, setSuccess] = useState(false);

  const [preferences, setPreferences] = useState({
    defaultPlatform: 'internal',
    language: 'en',
    notificationsEnabled: true,
    theme: 'light'
  });

  React.useEffect(() => {
    if (data?.me?.preferences) {
      setPreferences(data.me.preferences);
    }
  }, [data]);

  const handlePreferenceChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPreferences(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updatePreferences({
        variables: { preferences }
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating preferences:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        {/* User Preferences */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Preferences</h2>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Default Platform
                </label>
                <select
                  name="defaultPlatform"
                  value={preferences.defaultPlatform}
                  onChange={handlePreferenceChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="internal">Internal</option>
                  <option value="teams">Microsoft Teams</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Language
                </label>
                <select
                  name="language"
                  value={preferences.language}
                  onChange={handlePreferenceChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="notificationsEnabled"
                    checked={preferences.notificationsEnabled}
                    onChange={handlePreferenceChange}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Enable Notifications
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Theme
                </label>
                <select
                  name="theme"
                  value={preferences.theme}
                  onChange={handlePreferenceChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div className="flex items-center justify-end">
                {success && (
                  <span className="text-green-600 mr-4">
                    Settings saved successfully!
                  </span>
                )}
                <button
                  type="submit"
                  className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Teams Integration */}
        <TeamsConnect />

        {/* Security Settings */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Security</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Two-Factor Authentication
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Add an extra layer of security to your account
              </p>
              <button className="mt-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
                Set up 2FA
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
