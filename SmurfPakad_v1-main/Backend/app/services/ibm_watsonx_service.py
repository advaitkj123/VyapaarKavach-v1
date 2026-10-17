"""
IBM watsonx.ai Service — AI-Powered Analyst Briefs
====================================================
Integrates IBM's watsonx.ai Granite models to generate:
1. Natural language analyst briefs for flagged wallets
2. Regulatory advisory recommendations (FATF-mapped)
3. Risk summaries for SAR reports

Uses IBM Granite foundation models (free tier supported).
Falls back gracefully to a local template engine if API is unavailable.
"""
import logging
import json
import asyncio
from typing import Dict, List, Optional
from datetime import datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class IBMWatsonxService:
    """
    IBM watsonx.ai integration service.
    
    Provides AI-generated analyst briefs using IBM Granite models.
    Falls back to local template-based generation if IBM API
    is unavailable or API key is not configured.
    """
    
    def __init__(self):
        self._iam_token: Optional[str] = None
        self._token_expiry: Optional[float] = None
        self._http_client: Optional[httpx.AsyncClient] = None
    
    @property
    def is_configured(self) -> bool:
        """Check if IBM watsonx.ai credentials are configured."""
        return bool(settings.IBM_WATSONX_API_KEY and settings.IBM_WATSONX_PROJECT_ID)
    
    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create an async HTTP client."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=30.0)
        return self._http_client
    
    async def _get_iam_token(self) -> str:
        """
        Get an IBM Cloud IAM bearer token.
        Tokens are cached and refreshed before expiry.
        """
        import time
        
        # Return cached token if still valid (5 min buffer)
        if self._iam_token and self._token_expiry and time.time() < self._token_expiry - 300:
            return self._iam_token
        
        client = await self._get_http_client()
        
        try:
            response = await client.post(
                "https://iam.cloud.ibm.com/identity/token",
                data={
                    "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                    "apikey": settings.IBM_WATSONX_API_KEY,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response.raise_for_status()
            token_data = response.json()
            
            self._iam_token = token_data["access_token"]
            self._token_expiry = time.time() + token_data.get("expires_in", 3600)
            
            logger.info("IBM IAM token refreshed successfully")
            return self._iam_token
            
        except Exception as e:
            logger.error(f"Failed to get IBM IAM token: {e}")
            raise
    
    async def _call_watsonx(self, prompt: str, max_tokens: int = 1024) -> str:
        """
        Call IBM watsonx.ai text generation API.
        
        Args:
            prompt: The prompt to send to the model
            max_tokens: Maximum tokens to generate
            
        Returns:
            Generated text string
        """
        token = await self._get_iam_token()
        client = await self._get_http_client()
        
        url = f"{settings.IBM_WATSONX_URL}/ml/v1/text/generation?version=2024-03-14"
        
        payload = {
            "model_id": settings.IBM_WATSONX_MODEL_ID,
            "input": prompt,
            "project_id": settings.IBM_WATSONX_PROJECT_ID,
            "parameters": {
                "decoding_method": "greedy",
                "max_new_tokens": max_tokens,
                "min_new_tokens": 50,
                "temperature": 0.3,
                "top_p": 0.9,
                "repetition_penalty": 1.1,
                "stop_sequences": ["---", "\n\n\n"],
            },
        }
        
        try:
            response = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            result = response.json()
            
            generated_text = result["results"][0]["generated_text"].strip()
            logger.info(f"watsonx.ai generated {len(generated_text)} chars")
            return generated_text
            
        except Exception as e:
            logger.error(f"watsonx.ai API call failed: {e}")
            raise

    async def _call_groq(self, prompt: str, max_tokens: int = 1024) -> str:
        """
        Groq API fallback — 100% free, no credit card needed.
        Sign up at: https://console.groq.com (just email, no card)
        Uses Llama 3.1 70B — comparable quality to Granite.
        Set GROQ_API_KEY in your .env to enable.
        """
        import os
        groq_key = os.getenv("GROQ_API_KEY")
        if not groq_key:
            raise ValueError("GROQ_API_KEY not set")

        client = await self._get_http_client()
        try:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                json={
                    "model": "llama-3.1-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are an expert AML analyst at a financial intelligence unit."},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.3,
                },
                headers={
                    "Authorization": f"Bearer {groq_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"].strip()
            logger.info(f"Groq (Llama 3.1) generated {len(text)} chars")
            return text
        except Exception as e:
            logger.error(f"Groq API call failed: {e}")
            raise

    async def _call_gemini(self, prompt: str, max_tokens: int = 1024) -> str:
        """
        Google Gemini API fallback — free tier, no credit card needed.
        Get key at: https://aistudio.google.com/apikey
        Uses gemini-1.5-flash (fast, high quality).
        Set GEMINI_API_KEY in your .env to enable.
        """
        import os
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise ValueError("GEMINI_API_KEY not set")

        client = await self._get_http_client()
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            response = await client.post(
                url,
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "maxOutputTokens": max_tokens,
                        "temperature": 0.3,
                    },
                },
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            logger.info(f"Gemini generated {len(text)} chars")
            return text
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            raise

    async def _call_with_fallback(self, prompt: str, max_tokens: int = 1024) -> tuple[str, str]:
        """
        LLM fallback chain: IBM watsonx.ai → Groq (Llama 3.1) → Gemini → template
        Returns (generated_text, model_used).
        """
        import os

        # 1. Try IBM watsonx.ai
        if self.is_configured:
            try:
                text = await self._call_watsonx(prompt, max_tokens)
                return text, "ibm/granite-3-3-8b-instruct"
            except Exception as e:
                logger.warning(f"watsonx.ai unavailable, trying Groq: {e}")

        # 2. Try Groq (free, no card)
        if os.getenv("GROQ_API_KEY"):
            try:
                text = await self._call_groq(prompt, max_tokens)
                return text, "groq/llama-3.1-70b-versatile"
            except Exception as e:
                logger.warning(f"Groq unavailable, trying Gemini: {e}")

        # 3. Try Gemini (free, no card)
        if os.getenv("GEMINI_API_KEY"):
            try:
                text = await self._call_gemini(prompt, max_tokens)
                return text, "google/gemini-1.5-flash"
            except Exception as e:
                logger.warning(f"Gemini unavailable, using template: {e}")

        # 4. Template engine fallback
        raise ValueError("No LLM available — use template fallback")


    
    # =========================================================================
    # Public API
    # =========================================================================
    
    async def generate_analyst_brief(
        self,
        wallet_id: str,
        risk_score: float,
        risk_level: str,
        patterns: List[Dict],
        feature_importance: List[Dict],
        graph_metrics: Optional[Dict] = None,
        narrative: Optional[str] = None,
    ) -> Dict:
        """
        Generate an AI-powered analyst brief for a flagged wallet.
        
        Combines ML model output with IBM Granite to produce
        a human-readable investigation summary.
        
        Args:
            wallet_id: The wallet/address being investigated
            risk_score: Model risk score (0-1)
            risk_level: Risk level string (low/medium/high/critical)
            patterns: Structural patterns detected
            feature_importance: Top contributing features
            graph_metrics: Optional graph stats (degree, centrality)
            narrative: Optional pre-generated narrative from XAI engine
            
        Returns:
            Dict with brief, recommendations, regulatory_flags, and metadata
        """
        # Build context for the AI
        context = self._build_context(
            wallet_id, risk_score, risk_level,
            patterns, feature_importance, graph_metrics
        )
        
        # Try IBM watsonx.ai first, fallback to local
        if self.is_configured:
            try:
                brief = await self._generate_with_watsonx(context)
                return {
                    "walletId": wallet_id,
                    "brief": brief["summary"],
                    "recommendations": brief["recommendations"],
                    "regulatoryFlags": brief["regulatory_flags"],
                    "riskAssessment": brief["risk_assessment"],
                    "generatedBy": "IBM watsonx.ai (Granite)",
                    "modelId": settings.IBM_WATSONX_MODEL_ID,
                    "generatedAt": datetime.utcnow().isoformat(),
                    "confidence": risk_score,
                }
            except Exception as e:
                logger.warning(f"IBM watsonx.ai fallback triggered: {e}")
        
        # Fallback: local template-based generation
        brief = self._generate_local_brief(context)
        return {
            "walletId": wallet_id,
            "brief": brief["summary"],
            "recommendations": brief["recommendations"],
            "regulatoryFlags": brief["regulatory_flags"],
            "riskAssessment": brief["risk_assessment"],
            "generatedBy": "SmurfPakad Local Engine (IBM watsonx.ai unavailable)",
            "modelId": "local-template-v1",
            "generatedAt": datetime.utcnow().isoformat(),
            "confidence": risk_score,
        }
    
    async def generate_safeguard_advisory(
        self,
        recipient: str,
        amount: float,
        risk_score: float,
        risk_level: str,
        reasons: List[str],
        platform: str,
    ) -> Dict:
        """
        Generate a real-time advisory for Chrome Extension interceptions.
        Shorter and more actionable than full analyst briefs.
        """
        if self.is_configured:
            try:
                prompt = self._build_safeguard_prompt(
                    recipient, amount, risk_score, risk_level, reasons, platform
                )
                response = await self._call_watsonx(prompt, max_tokens=300)
                return {
                    "advisory": response,
                    "generatedBy": "IBM watsonx.ai",
                    "generatedAt": datetime.utcnow().isoformat(),
                }
            except Exception as e:
                logger.warning(f"Safeguard advisory fallback: {e}")
        
        # Fallback
        advisory = self._generate_local_safeguard_advisory(
            recipient, amount, risk_score, reasons
        )
        return {
            "advisory": advisory,
            "generatedBy": "SmurfPakad Local Engine",
            "generatedAt": datetime.utcnow().isoformat(),
        }
    
    # =========================================================================
    # IBM watsonx.ai Prompt Engineering
    # =========================================================================
    
    def _build_context(
        self,
        wallet_id: str,
        risk_score: float,
        risk_level: str,
        patterns: List[Dict],
        feature_importance: List[Dict],
        graph_metrics: Optional[Dict] = None,
    ) -> Dict:
        """Build structured context for AI generation."""
        return {
            "wallet_id": wallet_id,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "patterns": patterns,
            "features": feature_importance,
            "graph_metrics": graph_metrics or {},
        }
    
    async def _generate_with_watsonx(self, context: Dict) -> Dict:
        """Generate analyst brief using IBM watsonx.ai."""
        prompt = self._build_analyst_prompt(context)
        raw_response = await self._call_watsonx(prompt, max_tokens=800)
        return self._parse_analyst_response(raw_response, context)
    
    def _build_analyst_prompt(self, context: Dict) -> str:
        """Build the prompt for analyst brief generation."""
        patterns_text = "\n".join(
            f"  - [{p.get('severity', 'medium').upper()}] {p.get('type', 'unknown')}: {p.get('description', '')}"
            for p in context["patterns"]
        ) or "  No specific structural patterns detected."
        
        features_text = "\n".join(
            f"  - {f.get('feature_name', 'unknown')}: importance={f.get('importance', 0):.3f}, value={f.get('value', 0):.3f}"
            for f in context["features"][:5]
        ) or "  No feature importance data available."
        
        graph_text = ""
        if context["graph_metrics"]:
            gm = context["graph_metrics"]
            graph_text = f"""
Graph Metrics:
  - In-degree: {gm.get('in_degree', 'N/A')}
  - Out-degree: {gm.get('out_degree', 'N/A')}
  - Total connections: {gm.get('total_connections', 'N/A')}
  - Clustering coefficient: {gm.get('clustering', 'N/A')}"""
        
        prompt = f"""<|system|>
You are a senior financial crime analyst at an anti-money laundering (AML) compliance unit. You specialize in cryptocurrency transaction monitoring and smurfing detection. Generate precise, professional investigation summaries based on machine learning model outputs.
<|user|>
Analyze the following flagged wallet and generate a concise investigation brief.

WALLET ANALYSIS:
  Wallet ID: {context['wallet_id']}
  Risk Score: {context['risk_score']:.2f} / 1.00
  Risk Level: {context['risk_level'].upper()}

Detected Structural Patterns:
{patterns_text}

Top Contributing Features (ML Model):
{features_text}
{graph_text}

Generate a professional analyst brief with:
1. SUMMARY: A 2-3 sentence executive summary of the suspicious activity.
2. RISK ASSESSMENT: Why this wallet is flagged, referencing specific patterns and features.
3. REGULATORY FLAGS: Which FATF (Financial Action Task Force) red flag indicators apply.
4. RECOMMENDATIONS: Specific next steps for the investigation team (2-3 bullet points).
<|assistant|>
"""
        return prompt
    
    def _build_safeguard_prompt(
        self,
        recipient: str,
        amount: float,
        risk_score: float,
        risk_level: str,
        reasons: List[str],
        platform: str,
    ) -> str:
        """Build prompt for real-time payment advisory."""
        reasons_text = "\n".join(f"  - {r}" for r in reasons)
        
        prompt = f"""<|system|>
You are a payment security AI assistant. Generate brief, clear warnings for users about suspicious transactions. Be direct and helpful.
<|user|>
A payment on {platform} has been flagged:
- Recipient: {recipient}
- Amount: ₹{amount:,.0f}
- Risk Score: {risk_score:.2f}
- Risk Level: {risk_level.upper()}
- Reasons:
{reasons_text}

Generate a 2-3 sentence user-friendly warning explaining why this payment is suspicious and what the user should do.
<|assistant|>
"""
        return prompt
    
    def _parse_analyst_response(self, response: str, context: Dict) -> Dict:
        """Parse the raw watsonx response into structured sections."""
        # Try to extract sections
        sections = {
            "summary": "",
            "risk_assessment": "",
            "regulatory_flags": [],
            "recommendations": [],
        }
        
        current_section = "summary"
        lines = response.split("\n")
        
        for line in lines:
            line_stripped = line.strip()
            lower = line_stripped.lower()
            
            if "risk assessment" in lower or "risk analysis" in lower:
                current_section = "risk_assessment"
                continue
            elif "regulatory" in lower or "fatf" in lower:
                current_section = "regulatory_flags"
                continue
            elif "recommendation" in lower or "next step" in lower:
                current_section = "recommendations"
                continue
            elif "summary" in lower and len(line_stripped) < 30:
                current_section = "summary"
                continue
            
            if not line_stripped:
                continue
            
            # Clean bullet points
            clean = line_stripped.lstrip("•-*123456789. ")
            if not clean:
                continue
            
            if current_section in ("regulatory_flags", "recommendations"):
                sections[current_section].append(clean)
            else:
                if sections[current_section]:
                    sections[current_section] += " " + clean
                else:
                    sections[current_section] = clean
        
        # Ensure we have content
        if not sections["summary"]:
            sections["summary"] = response[:300]
        if not sections["regulatory_flags"]:
            sections["regulatory_flags"] = self._map_fatf_flags(context["patterns"])
        if not sections["recommendations"]:
            sections["recommendations"] = self._default_recommendations(context)
        
        return sections
    
    # =========================================================================
    # Fallback: Local Template-Based Generation
    # =========================================================================
    
    def _generate_local_brief(self, context: Dict) -> Dict:
        """Generate a brief using local templates when IBM API is unavailable."""
        wallet_short = context["wallet_id"][:16] + "..." if len(context["wallet_id"]) > 16 else context["wallet_id"]
        risk = context["risk_score"]
        level = context["risk_level"]
        patterns = context["patterns"]
        
        # Summary
        if risk >= 0.7:
            summary = (
                f"Wallet {wallet_short} has been flagged with a CRITICAL risk score of {risk:.2f}. "
                f"The Graph Neural Network model detected {len(patterns)} structural anomalies "
                f"consistent with known money laundering typologies. Immediate investigation is recommended."
            )
        elif risk >= 0.4:
            summary = (
                f"Wallet {wallet_short} shows elevated risk indicators (score: {risk:.2f}). "
                f"The analysis identified {len(patterns)} suspicious pattern(s) that warrant "
                f"closer scrutiny by the compliance team."
            )
        else:
            summary = (
                f"Wallet {wallet_short} has a low risk score of {risk:.2f}. "
                f"No significant money laundering indicators were detected at this time, "
                f"though continued monitoring is advised."
            )
        
        # Risk assessment
        risk_parts = []
        for p in patterns:
            if p.get("type") == "fan_out":
                risk_parts.append(
                    "Fan-out pattern detected: Funds are being distributed to multiple "
                    "recipients, a hallmark of the 'placement' stage of money laundering."
                )
            elif p.get("type") == "fan_in":
                risk_parts.append(
                    "Fan-in pattern detected: Multiple sources are consolidating funds "
                    "into this wallet, indicating possible aggregation activity."
                )
            elif p.get("type") == "pass_through":
                risk_parts.append(
                    "Pass-through (mule) pattern detected: This wallet both receives and "
                    "redistributes funds, consistent with layering operations."
                )
            elif p.get("type") == "high_activity":
                risk_parts.append(
                    "Abnormally high transaction volume detected, exceeding typical "
                    "patterns for legitimate wallets in this network segment."
                )
        
        risk_assessment = " ".join(risk_parts) if risk_parts else (
            "The model's suspicion is primarily driven by aggregate feature values "
            "rather than specific structural patterns."
        )
        
        return {
            "summary": summary,
            "risk_assessment": risk_assessment,
            "regulatory_flags": self._map_fatf_flags(patterns),
            "recommendations": self._default_recommendations(context),
        }
    
    def _generate_local_safeguard_advisory(
        self, recipient: str, amount: float, risk_score: float, reasons: List[str]
    ) -> str:
        """Local fallback for safeguard advisory."""
        if risk_score >= 0.7:
            severity = "HIGH RISK"
            action = "We strongly recommend cancelling this transaction and reporting the recipient."
        elif risk_score >= 0.4:
            severity = "SUSPICIOUS"
            action = "Please verify the recipient's identity before proceeding."
        else:
            severity = "CAUTION"
            action = "This transaction has minor risk indicators. Proceed with awareness."
        
        top_reason = reasons[0] if reasons else "Multiple risk indicators detected"
        return (
            f"⚠️ {severity}: This payment of ₹{amount:,.0f} to {recipient[:20]}... "
            f"has been flagged. {top_reason}. {action}"
        )
    
    # =========================================================================
    # FATF Red Flag Mapping
    # =========================================================================
    
    def _map_fatf_flags(self, patterns: List[Dict]) -> List[str]:
        """Map detected patterns to FATF Red Flag Indicators."""
        flags = []
        pattern_types = {p.get("type") for p in patterns}
        
        if "fan_out" in pattern_types:
            flags.append(
                "FATF Indicator 3.1 — Structuring: Transactions are being split "
                "across multiple recipients to avoid reporting thresholds."
            )
        if "fan_in" in pattern_types:
            flags.append(
                "FATF Indicator 3.2 — Aggregation: Funds from multiple sources "
                "are being consolidated, suggesting collection point activity."
            )
        if "pass_through" in pattern_types:
            flags.append(
                "FATF Indicator 5.1 — Use of Intermediaries: This wallet operates "
                "as a pass-through, consistent with layering through nominees."
            )
        if "high_activity" in pattern_types:
            flags.append(
                "FATF Indicator 4.1 — Rapid Movement of Funds: Transaction velocity "
                "significantly exceeds normal patterns, indicating urgency to move funds."
            )
        
        # Check feature-based flags
        for p in patterns:
            desc = p.get("description", "").lower()
            if "threshold" in desc or "structuring" in desc:
                flag = (
                    "FATF Indicator 3.3 — Threshold Evasion: Transaction amounts are "
                    "clustered just below mandatory reporting limits."
                )
                if flag not in flags:
                    flags.append(flag)
        
        if not flags:
            flags.append(
                "No specific FATF Red Flag Indicators matched. "
                "The alert is based on aggregate ML model scoring."
            )
        
        return flags
    
    def _default_recommendations(self, context: Dict) -> List[str]:
        """Generate default investigation recommendations."""
        recommendations = []
        risk = context["risk_score"]
        patterns = context["patterns"]
        pattern_types = {p.get("type") for p in patterns}
        
        if risk >= 0.7:
            recommendations.append(
                "ESCALATE: File a Suspicious Activity Report (SAR) with the Financial "
                "Intelligence Unit within 24 hours."
            )
        
        if "pass_through" in pattern_types:
            recommendations.append(
                "TRACE: Map the full transaction chain upstream and downstream to "
                "identify the ultimate source and destination of funds."
            )
        
        if "fan_out" in pattern_types or "fan_in" in pattern_types:
            recommendations.append(
                "EXPAND: Investigate all connected wallets in the cluster — "
                "smurfing networks typically involve 5-20 coordinated wallets."
            )
        
        if risk >= 0.4:
            recommendations.append(
                "MONITOR: Place this wallet on enhanced monitoring with "
                "automated alerts for any new transaction activity."
            )
        
        recommendations.append(
            "DOCUMENT: Preserve all transaction records, graph snapshots, "
            "and model outputs for regulatory audit trail."
        )
        
        return recommendations[:4]
    
    async def get_service_status(self) -> Dict:
        """Check IBM watsonx.ai service status."""
        status = {
            "configured": self.is_configured,
            "provider": "IBM watsonx.ai",
            "model": settings.IBM_WATSONX_MODEL_ID,
            "endpoint": settings.IBM_WATSONX_URL,
            "status": "unknown",
        }
        
        if not self.is_configured:
            status["status"] = "not_configured"
            status["message"] = "IBM_WATSONX_API_KEY and IBM_WATSONX_PROJECT_ID required"
            return status
        
        try:
            await self._get_iam_token()
            status["status"] = "connected"
            status["message"] = "IBM watsonx.ai is operational"
        except Exception as e:
            status["status"] = "error"
            status["message"] = f"Connection failed: {str(e)}"
        
        return status
    
    async def close(self):
        """Close HTTP client on shutdown."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()


# Global service instance
ibm_watsonx_service = IBMWatsonxService()
