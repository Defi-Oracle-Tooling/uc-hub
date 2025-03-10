import { useState, useEffect } from 'react';
import { gql, useLazyQuery, useMutation } from '@apollo/client';

const GET_SUPPORTED_LANGUAGES = gql`
  query GetSupportedLanguages {
    supportedLanguages {
      code
      name
      nativeName
    }
  }
`;

const TRANSLATE_MESSAGE = gql`
  mutation TranslateMessage($messageId: ID!, $targetLanguage: String!) {
    translateMessage(messageId: $messageId, targetLanguage: $targetLanguage) {
      text
      detectedLanguage
      confidence
    }
  }
`;

const TRANSLATE_MESSAGES = gql`
  mutation TranslateMessages($messageIds: [ID!]!, $targetLanguage: String!) {
    translateMessages(messageIds: $messageIds, targetLanguage: $targetLanguage) {
      text
      detectedLanguage
      confidence
    }
  }
`;

export function useTranslation() {
  const [supportedLanguages, setSupportedLanguages] = useState([]);
  const [targetLanguage, setTargetLanguage] = useState(null);
  const [translations, setTranslations] = useState({});

  const [fetchLanguages] = useLazyQuery(GET_SUPPORTED_LANGUAGES, {
    onCompleted: (data) => {
      setSupportedLanguages(data.supportedLanguages);
    },
    onError: (error) => {
      console.error('Failed to fetch supported languages:', error);
    }
  });

  const [translateMessage] = useMutation(TRANSLATE_MESSAGE);

  useEffect(() => {
    fetchLanguages();
  }, [fetchLanguages]);

  const translate = async (messageId, language) => {
    if (!language || translations[`${messageId}:${language}`]) {
      return;
    }

    try {
      const { data } = await translateMessage({
        variables: { messageId, targetLanguage: language }
      });

      setTranslations(prev => ({
        ...prev,
        [`${messageId}:${language}`]: data.translateMessage
      }));

      return data.translateMessage;
    } catch (error) {
      console.error('Translation failed:', error);
      throw error;
    }
  };

  const getTranslation = (messageId, language) => {
    return translations[`${messageId}:${language}`];
  };

  return {
    supportedLanguages,
    targetLanguage,
    setTargetLanguage,
    translate,
    getTranslation,
    hasTranslation: (messageId, language) => !!translations[`${messageId}:${language}`]
  };
}