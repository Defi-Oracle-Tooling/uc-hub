"""
Translation Model Handler

This module provides a unified interface to access various translation models,
whether they're cloud-based API services or locally deployed models.
"""

import os
import json
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Union

class TranslationModelHandler(ABC):
    """Base class for translation model handlers"""
    
    @abstractmethod
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text from source language to target language"""
        pass
    
    @abstractmethod
    def batch_translate(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        """Translate multiple texts from source language to target language"""
        pass

class CloudTranslationHandler(TranslationModelHandler):
    """Handler for cloud-based translation services"""
    
    def __init__(self, api_key: str, endpoint: str):
        self.api_key = api_key
        self.endpoint = endpoint
        
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate using cloud API"""
        # In a real implementation, this would make an API call
        print(f"Translating from {source_lang} to {target_lang}")
        return f"[Translated: {text}]"
        
    def batch_translate(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        """Batch translate using cloud API"""
        return [self.translate(text, source_lang, target_lang) for text in texts]

class EdgeTranslationHandler(TranslationModelHandler):
    """Handler for edge-deployed translation models"""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        print(f"Loading edge translation model from {model_path}")
        # In a real implementation, this would load a model
        
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate using local model"""
        print(f"Edge translating from {source_lang} to {target_lang}")
        return f"[Edge Translated: {text}]"
        
    def batch_translate(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        """Batch translate using local model"""
        return [self.translate(text, source_lang, target_lang) for text in texts]

def get_translation_handler(config_path: str = "config.json") -> TranslationModelHandler:
    """Factory function to get the appropriate translation handler"""
    # Load configuration
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
    except Exception as e:
        print(f"Error loading config: {e}")
        # Default to cloud handler
        return CloudTranslationHandler(
            api_key=os.environ.get("TRANSLATION_API_KEY", "demo-key"),
            endpoint=os.environ.get("TRANSLATION_ENDPOINT", "https://api.translation.com/v1")
        )
    
    if config.get("deployment_mode") == "edge":
        return EdgeTranslationHandler(model_path=config.get("model_path", "models/translation"))
    else:
        return CloudTranslationHandler(
            api_key=config.get("api_key", os.environ.get("TRANSLATION_API_KEY", "demo-key")),
            endpoint=config.get("endpoint", os.environ.get("TRANSLATION_ENDPOINT", "https://api.translation.com/v1"))
        )
