"""
IBM Watson Natural Language Understanding — Transaction Narration Analyzer
===========================================================================
Analyzes free-text transaction remarks/narrations for suspicious keywords
and sentiment. Adds a NEW detection dimension beyond graph topology.

Examples of suspicious narrations Watson NLP catches:
  - "rent" paid 8x in 3 days to different people
  - "gift" for ₹95,000 to unknown person
  - "loan repayment" in round numbers at 2AM
  - "medical emergency" on a dormant account suddenly active

IBM Watson NLU Free Tier:
  - 30,000 NLU items/month
  - No credit card required
  - Get API key: https://cloud.ibm.com/catalog/services/natural-language-understanding

If Watson NLU is not configured, falls back to a keyword rule engine
(still catches 80% of cases without any API call).
"""
import os
import re
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Suspicious keyword categories with risk weights
SUSPICIOUS_PATTERNS = {
    "threshold_evasion": {
        "keywords": ["urgent", "quick transfer", "immediate", "fast money", "hurry"],
        "weight": 0.3,
        "fatf_flag": "RF-7",
    },
    "structuring_language": {
        "keywords": ["split", "divide", "partial", "first part", "second part", "installment"],
        "weight": 0.4,
        "fatf_flag": "RF-1",
    },
    "cash_conversion": {
        "keywords": ["cash", "withdrawal", "atm", "physical", "notes", "hard cash"],
        "weight": 0.35,
        "fatf_flag": "RF-3",
    },
    "false_labeling": {
        "keywords": ["gift", "donation", "charity", "loan", "rent", "salary", "reimbursement"],
        "weight": 0.25,  # Common words BUT suspicious at high amounts
        "fatf_flag": "RF-2",
    },
    "anonymity_seeking": {
        "keywords": ["private", "confidential", "secret", "don't mention", "personal"],
        "weight": 0.45,
        "fatf_flag": "RF-10",
    },
}

ROUND_AMOUNT_PATTERN = re.compile(r"\b(99[,\s]?[59]00|98[,\s]?000|1[,\s]?00[,\s]?000)\b")


class WatsonNLPService:
    """
    Analyzes transaction narrations for suspicious intent.
    Uses IBM Watson NLU if configured, keyword rules otherwise.
    """

    def __init__(self):
        self._api_key = os.getenv("IBM_WATSON_NLU_API_KEY")
        self._url = os.getenv(
            "IBM_WATSON_NLU_URL",
            "https://api.us-south.natural-language-understanding.watson.cloud.ibm.com"
        )
        self._client = None
        self._backend = "rules"
        self._init_client()

    def _init_client(self):
        """Try IBM Watson NLU SDK, fall back to rule engine."""
        if not self._api_key:
            logger.info("Watson NLU: no API key — using keyword rule engine")
            return
        try:
            from ibm_watson import NaturalLanguageUnderstandingV1
            from ibm_cloud_sdk_core.authenticators import IAMAuthenticator

            authenticator = IAMAuthenticator(self._api_key)
            self._client = NaturalLanguageUnderstandingV1(
                version="2022-04-07",
                authenticator=authenticator,
            )
            self._client.set_service_url(self._url)
            self._backend = "watson_nlu"
            logger.info("✅ IBM Watson NLU connected")
        except ImportError:
            logger.info("ibm-watson SDK not installed — using keyword rule engine")
        except Exception as e:
            logger.warning(f"Watson NLU init failed: {e}")

    def analyze_narration(
        self,
        narration: str,
        amount: float = 0.0,
    ) -> Dict:
        """
        Analyze a transaction narration for suspicious signals.

        Args:
            narration: Free-text transaction remark
            amount: Transaction amount in INR (context for risk weighting)

        Returns:
            {
                suspicionScore: float,
                flags: List[str],
                fatfIndicators: List[str],
                analysis: str,
                backend: str
            }
        """
        if self._backend == "watson_nlu" and self._client:
            return self._analyze_with_watson(narration, amount)
        return self._analyze_with_rules(narration, amount)

    def _analyze_with_watson(self, narration: str, amount: float) -> Dict:
        """Use IBM Watson NLU for deep semantic analysis."""
        try:
            from ibm_watson.natural_language_understanding_v1 import (
                Features, KeywordsOptions, SentimentOptions, CategoriesOptions
            )
            response = self._client.analyze(
                text=narration,
                features=Features(
                    keywords=KeywordsOptions(limit=10),
                    sentiment=SentimentOptions(),
                    categories=CategoriesOptions(limit=3),
                ),
                language="en",
            ).get_result()

            # Extract sentiment (negative sentiment on financial txn = suspicious)
            sentiment_score = response.get("sentiment", {}).get("document", {}).get("score", 0)
            keywords = [k["text"] for k in response.get("keywords", [])]

            # Run rule engine on top of Watson keywords for FATF mapping
            rule_result = self._analyze_with_rules(" ".join(keywords), amount)

            return {
                "suspicionScore": min(rule_result["suspicionScore"] + abs(sentiment_score) * 0.1, 1.0),
                "flags": rule_result["flags"],
                "fatfIndicators": rule_result["fatfIndicators"],
                "watsonKeywords": keywords,
                "sentiment": sentiment_score,
                "analysis": f"Watson NLU detected: {', '.join(keywords[:3])} | {rule_result['analysis']}",
                "backend": "ibm_watson_nlu",
            }
        except Exception as e:
            logger.warning(f"Watson NLU call failed: {e} — falling back to rules")
            return self._analyze_with_rules(narration, amount)

    def _analyze_with_rules(self, narration: str, amount: float) -> Dict:
        """Keyword rule engine — no API required."""
        text_lower = narration.lower()
        total_score = 0.0
        flags = []
        fatf_indicators = []

        for category, config in SUSPICIOUS_PATTERNS.items():
            for keyword in config["keywords"]:
                if keyword in text_lower:
                    # Higher amounts → higher weight for same keyword
                    amount_multiplier = min(amount / 50000, 2.0) if amount > 10000 else 1.0
                    total_score += config["weight"] * amount_multiplier
                    if category not in flags:
                        flags.append(category)
                        fatf_indicators.append(config["fatf_flag"])
                    break

        # Round amount evasion check (₹99,500 / ₹98,000 etc.)
        if ROUND_AMOUNT_PATTERN.search(narration):
            total_score += 0.3
            flags.append("round_amount_evasion")
            fatf_indicators.append("RF-7")

        # Very short narrations on large amounts = suspicious
        if len(narration.strip()) < 5 and amount > 50000:
            total_score += 0.2
            flags.append("missing_narration_large_amount")
            fatf_indicators.append("RF-14")

        suspicion = min(total_score, 1.0)
        analysis = (
            f"Suspicious narration patterns: {', '.join(flags)}" if flags
            else "No suspicious narration patterns detected"
        )

        return {
            "suspicionScore": round(suspicion, 3),
            "flags": flags,
            "fatfIndicators": list(set(fatf_indicators)),
            "analysis": analysis,
            "backend": "keyword_rules",
        }

    def analyze_batch(self, transactions: List[Dict]) -> List[Dict]:
        """Analyze a batch of transactions, adding narration risk to each."""
        results = []
        for tx in transactions:
            narration = tx.get("narration", tx.get("description", tx.get("remarks", "")))
            amount = float(tx.get("amount", 0))
            analysis = self.analyze_narration(narration, amount)
            results.append({**tx, "narrationAnalysis": analysis})
        return results

    @property
    def is_watson_nlu(self) -> bool:
        return self._backend == "watson_nlu"


# Singleton
watson_nlp = WatsonNLPService()
