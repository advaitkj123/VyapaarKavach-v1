"""
FATF Red Flag Mapping Service
================================
Maps detected ML patterns to official FATF (Financial Action Task Force)
Red Flag Indicators for money laundering and terrorist financing.

Reference: FATF Guidance on Money Laundering and Terrorist Financing 
Indicators, Risk-Based Approach guidance papers.

Used by:
- IBM watsonx.ai service for regulatory advisory
- SAR report generation
- War Room UI for compliance tagging
"""
from typing import Dict, List, Optional


# ============================================================================
# FATF Red Flag Indicator Database
# ============================================================================

FATF_INDICATORS = {
    # Category 3: Transactions related to the account/business relationship
    "3.1": {
        "id": "FATF-3.1",
        "category": "Transaction Patterns",
        "title": "Structuring / Smurfing",
        "description": (
            "Transactions are being split into multiple smaller amounts to avoid "
            "mandatory reporting thresholds (Currency Transaction Reports)."
        ),
        "severity": "high",
        "triggers": ["fan_out", "structuring", "threshold_evasion"],
    },
    "3.2": {
        "id": "FATF-3.2",
        "category": "Transaction Patterns",
        "title": "Aggregation / Consolidation",
        "description": (
            "Funds from multiple sources are being consolidated into a single "
            "account, potentially indicating collection point activity."
        ),
        "severity": "high",
        "triggers": ["fan_in", "aggregation"],
    },
    "3.3": {
        "id": "FATF-3.3",
        "category": "Transaction Patterns",
        "title": "Threshold Evasion",
        "description": (
            "Transaction amounts are systematically just below mandatory "
            "reporting limits, indicating deliberate evasion of CTR filing."
        ),
        "severity": "critical",
        "triggers": ["threshold_proximity", "threshold_evasion", "just_below_threshold"],
    },
    "3.4": {
        "id": "FATF-3.4",
        "category": "Transaction Patterns",
        "title": "Round Amount Transactions",
        "description": (
            "Frequent transactions in round amounts, which may indicate "
            "that transactions are not genuine commercial activity."
        ),
        "severity": "medium",
        "triggers": ["round_amount"],
    },
    # Category 4: Rapid movement of funds
    "4.1": {
        "id": "FATF-4.1",
        "category": "Fund Movement",
        "title": "Rapid Movement of Funds",
        "description": (
            "Funds are moved rapidly between accounts or wallets without "
            "apparent business purpose, suggesting urgency to distance "
            "funds from their source."
        ),
        "severity": "high",
        "triggers": ["high_activity", "burst", "rapid_movement", "velocity"],
    },
    "4.2": {
        "id": "FATF-4.2",
        "category": "Fund Movement",
        "title": "Layering Through Multiple Accounts",
        "description": (
            "Funds pass through multiple intermediary accounts in quick "
            "succession, making it difficult to trace the origin."
        ),
        "severity": "critical",
        "triggers": ["pass_through", "layering", "chain"],
    },
    # Category 5: Use of intermediaries
    "5.1": {
        "id": "FATF-5.1",
        "category": "Intermediaries",
        "title": "Use of Nominees / Mule Accounts",
        "description": (
            "Account acts as an intermediary — receiving from multiple "
            "sources and redistributing to multiple destinations, "
            "consistent with money mule activity."
        ),
        "severity": "critical",
        "triggers": ["pass_through", "mule"],
    },
    # Category 6: Unusual customer behavior
    "6.1": {
        "id": "FATF-6.1",
        "category": "Behavioral",
        "title": "Unusual Transaction Timing",
        "description": (
            "Transactions occur at unusual hours or at suspiciously "
            "regular intervals, suggesting automated or bot-driven activity."
        ),
        "severity": "medium",
        "triggers": ["off_hours", "regularity", "automated"],
    },
    "6.2": {
        "id": "FATF-6.2",
        "category": "Behavioral",
        "title": "Dormant Account Activation",
        "description": (
            "Account shows sudden high activity after a prolonged dormant "
            "period, which may indicate account compromise or sale."
        ),
        "severity": "high",
        "triggers": ["dormancy", "reactivation"],
    },
    # Category 7: Cross-platform
    "7.1": {
        "id": "FATF-7.1",
        "category": "Cross-Platform",
        "title": "Cross-Platform Fund Transfer",
        "description": (
            "Funds are moved across multiple payment platforms or services "
            "(e.g., Paytm → PhonePe → GPay), exploiting the lack of "
            "cross-platform visibility in traditional monitoring systems."
        ),
        "severity": "critical",
        "triggers": ["cross_platform", "multi_platform"],
    },
}


class FATFService:
    """
    Maps detected patterns to official FATF Red Flag Indicators.
    
    Provides regulatory compliance tagging for:
    - Structural patterns from GNN analysis
    - Temporal features from feature engineering
    - Behavioral patterns from safeguard checks
    """
    
    def map_patterns_to_fatf(
        self,
        patterns: List[Dict],
        feature_importance: Optional[List[Dict]] = None,
        risk_reasons: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Map a set of detected patterns to FATF indicators.
        
        Args:
            patterns: Structural patterns from explainability engine
            feature_importance: Feature importance list from XAI
            risk_reasons: Text reasons from SafeGuard service
            
        Returns:
            List of matched FATF indicators with metadata
        """
        matched = []
        seen_ids = set()
        
        # 1. Match structural patterns
        for pattern in patterns:
            p_type = pattern.get("type", "").lower()
            p_desc = pattern.get("description", "").lower()
            p_severity = pattern.get("severity", "medium")
            
            for indicator_id, indicator in FATF_INDICATORS.items():
                if indicator["id"] in seen_ids:
                    continue
                    
                for trigger in indicator["triggers"]:
                    if trigger in p_type or trigger in p_desc:
                        matched.append({
                            **indicator,
                            "matchedPattern": pattern.get("type", "unknown"),
                            "matchedDescription": pattern.get("description", ""),
                            "patternSeverity": p_severity,
                        })
                        seen_ids.add(indicator["id"])
                        break
        
        # 2. Match feature-based indicators
        if feature_importance:
            for feat in feature_importance:
                name = feat.get("feature_name", "").lower()
                value = feat.get("value", 0)
                
                if "threshold" in name and value > 0.5:
                    self._add_if_new(matched, seen_ids, "3.3",
                                     f"Feature '{feat['feature_name']}' value={value:.3f}")
                elif "burst" in name and value > 0.5:
                    self._add_if_new(matched, seen_ids, "4.1",
                                     f"Feature '{feat['feature_name']}' value={value:.3f}")
                elif "regularity" in name and value > 0.5:
                    self._add_if_new(matched, seen_ids, "6.1",
                                     f"Feature '{feat['feature_name']}' value={value:.3f}")
                elif "round_amount" in name and value > 0.3:
                    self._add_if_new(matched, seen_ids, "3.4",
                                     f"Feature '{feat['feature_name']}' value={value:.3f}")
        
        # 3. Match text-based reasons (from SafeGuard)
        if risk_reasons:
            combined_text = " ".join(risk_reasons).lower()
            
            if "threshold" in combined_text or "structuring" in combined_text:
                self._add_if_new(matched, seen_ids, "3.3", "SafeGuard text match")
            if "rapid" in combined_text or "velocity" in combined_text:
                self._add_if_new(matched, seen_ids, "4.1", "SafeGuard text match")
            if "round amount" in combined_text:
                self._add_if_new(matched, seen_ids, "3.4", "SafeGuard text match")
            if "off-hour" in combined_text or "unusual timing" in combined_text:
                self._add_if_new(matched, seen_ids, "6.1", "SafeGuard text match")
            if "fan-out" in combined_text or "multiple recipients" in combined_text:
                self._add_if_new(matched, seen_ids, "3.1", "SafeGuard text match")
        
        # Sort by severity (critical first)
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        matched.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 4))
        
        return matched
    
    def _add_if_new(
        self,
        matched: List[Dict],
        seen_ids: set,
        indicator_key: str,
        match_source: str,
    ):
        """Add an indicator if not already matched."""
        indicator = FATF_INDICATORS.get(indicator_key)
        if indicator and indicator["id"] not in seen_ids:
            matched.append({
                **indicator,
                "matchedPattern": match_source,
                "matchedDescription": f"Matched via {match_source}",
                "patternSeverity": indicator["severity"],
            })
            seen_ids.add(indicator["id"])
    
    def get_compliance_summary(self, fatf_matches: List[Dict]) -> Dict:
        """
        Generate a compliance summary from FATF matches.
        Used in SAR reports.
        """
        if not fatf_matches:
            return {
                "totalIndicators": 0,
                "highestSeverity": "none",
                "categories": [],
                "sarRequired": False,
                "summary": "No FATF Red Flag Indicators matched.",
            }
        
        categories = list(set(m["category"] for m in fatf_matches))
        severities = [m.get("severity", "low") for m in fatf_matches]
        severity_order = {"critical": 3, "high": 2, "medium": 1, "low": 0}
        highest = max(severities, key=lambda s: severity_order.get(s, 0))
        
        # SAR is required if any critical or multiple high severity
        sar_required = (
            "critical" in severities or
            severities.count("high") >= 2
        )
        
        indicator_titles = [m["title"] for m in fatf_matches]
        
        return {
            "totalIndicators": len(fatf_matches),
            "highestSeverity": highest,
            "categories": categories,
            "sarRequired": sar_required,
            "indicatorTitles": indicator_titles,
            "summary": (
                f"{len(fatf_matches)} FATF Red Flag Indicator(s) detected "
                f"across {len(categories)} category/categories. "
                f"Highest severity: {highest.upper()}. "
                f"{'SAR filing recommended.' if sar_required else 'Enhanced monitoring recommended.'}"
            ),
        }
    
    def get_all_indicators(self) -> List[Dict]:
        """Return all FATF indicators for reference."""
        return [
            {**v, "indicatorKey": k}
            for k, v in FATF_INDICATORS.items()
        ]


# Global service instance
fatf_service = FATFService()
