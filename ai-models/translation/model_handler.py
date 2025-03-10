"""
Translation Model Handler

This module provides a unified interface to access various translation models,
whether they're cloud-based API services or locally deployed models.
"""

import os
import json
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Union
import torch
from transformers import MarianMTModel, MarianTokenizer
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

class TranslationRequest(BaseModel):
    text: str
    target_language: str
    source_language: Optional[str] = None

class BatchTranslationRequest(BaseModel):
    texts: List[str]
    target_language: str
    source_language: Optional[str] = None

class TranslationResponse(BaseModel):
    translated_text: str
    detected_language: str
    confidence: float

class BatchTranslationResponse(BaseModel):
    translations: List[TranslationResponse]

class LanguageDetectionResponse(BaseModel):
    detected_language: str
    confidence: float

class TranslationModelHandler:
    def __init__(self):
        self.models = {}
        self.tokenizers = {}
        self.language_pairs = self._load_language_pairs()
        
    def _load_language_pairs(self):
        # Load supported language pairs from config
        config_path = os.path.join(os.path.dirname(__file__), '../config/default.json')
        with open(config_path) as f:
            config = json.load(f)
            return config['translation']['supported_language_pairs']
    
    def _get_model_name(self, source_lang, target_lang):
        if source_lang and target_lang:
            return f'Helsinki-NLP/opus-mt-{source_lang}-{target_lang}'
        return None
    
    def _load_model(self, source_lang, target_lang):
        model_name = self._get_model_name(source_lang, target_lang)
        if model_name not in self.models:
            try:
                self.tokenizers[model_name] = MarianTokenizer.from_pretrained(model_name)
                self.models[model_name] = MarianMTModel.from_pretrained(model_name)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Unsupported language pair: {source_lang}-{target_lang}")
        return self.models[model_name], self.tokenizers[model_name]
    
    async def translate(self, text: str, target_lang: str, source_lang: Optional[str] = None):
        if not source_lang:
            # Detect language if not provided
            source_lang = await self.detect_language(text)
        
        model, tokenizer = self._load_model(source_lang, target_lang)
        
        try:
            inputs = tokenizer(text, return_tensors="pt", padding=True)
            translated = model.generate(**inputs)
            result = tokenizer.decode(translated[0], skip_special_tokens=True)
            
            return TranslationResponse(
                translated_text=result,
                detected_language=source_lang,
                confidence=0.95  # TODO: Implement proper confidence scoring
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def batch_translate(self, texts: List[str], target_lang: str, source_lang: Optional[str] = None):
        results = []
        for text in texts:
            result = await self.translate(text, target_lang, source_lang)
            results.append(result)
        return BatchTranslationResponse(translations=results)
    
    async def detect_language(self, text: str):
        # TODO: Implement proper language detection
        # For now, default to 'en' as source language
        return 'en'

model_handler = TranslationModelHandler()

@app.post("/translate", response_model=TranslationResponse)
async def translate(request: TranslationRequest):
    return await model_handler.translate(
        request.text,
        request.target_language,
        request.source_language
    )

@app.post("/translate/batch", response_model=BatchTranslationResponse)
async def batch_translate(request: BatchTranslationRequest):
    return await model_handler.batch_translate(
        request.texts,
        request.target_language,
        request.source_language
    )

@app.post("/detect", response_model=LanguageDetectionResponse)
async def detect_language(text: str):
    detected = await model_handler.detect_language(text)
    return LanguageDetectionResponse(
        detected_language=detected,
        confidence=0.95  # TODO: Implement proper confidence scoring
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
