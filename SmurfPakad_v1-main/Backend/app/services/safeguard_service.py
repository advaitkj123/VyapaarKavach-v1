"""
Safeguard Service - Real-time payment risk scoring
Used by the Chrome Extension to check transactions before payment.
"""
import sys
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path

# Add AI/ML to path
ML_PATH = Path(__file__).parent.parent.parent.parent / "AI" / "ML"
sys.path.insert(0, str(ML_PATH))


class SafeguardService:
    """
    Real-time payment risk scoring service.
    
    Combines:
    1. Rule-based heuristics (CTR evasion, velocity, patterns)
    2. Recipient reputation (blacklist, history)
    3. ML model scoring (when graph context available)
    """
    
    # CTR thresholds by currency
    CTR_THRESHOLDS = {
        'INR': 1000000,   # ₹10 Lakh
        'USD': 10000,
        'EUR': 15000,
        'DEFAULT': 10000,
    }
    
    def __init__(self):
        self._recent_checks: Dict[str, List[Dict]] = defaultdict(list)
        self._flagged_recipients: Dict[str, Dict] = {}
        self._blacklist: set = set()
    
    async def check_transaction(
        self,
        recipient: str,
        amount: float,
        platform: str,
        sender_id: Optional[str] = None,
        sender_history: Optional[List[Dict]] = None,
        currency: str = 'INR',
    ) -> Dict:
        """
        Check a single transaction for risk.
        
        Returns:
            {
                riskScore: float (0-1),
                riskLevel: str (low/medium/high/critical),
                reasons: List[str],
                message: str,
            }
        """
        reasons = []
        risk_score = 0.0
        threshold = self.CTR_THRESHOLDS.get(currency, self.CTR_THRESHOLDS['DEFAULT'])
        
        # =====================================================================
        # Rule 1: CTR Threshold Evasion (Structuring)
        # =====================================================================
        if amount > 0:
            ratio = amount / threshold
            if 0.95 <= ratio <= 1.0:
                risk_score += 0.35
                reasons.append(
                    f"Amount ({self._format_amount(amount, currency)}) is "
                    f"{ratio*100:.0f}% of reporting threshold — "
                    f"strong structuring indicator"
                )
            elif 0.90 <= ratio < 0.95:
                risk_score += 0.20
                reasons.append(
                    f"Amount is {ratio*100:.0f}% of reporting threshold — "
                    f"possible structuring"
                )
            elif 0.80 <= ratio < 0.90:
                risk_score += 0.10
                reasons.append(
                    f"Amount approaching reporting threshold"
                )
        
        # =====================================================================
        # Rule 2: Round Amount Detection
        # =====================================================================
        if amount > 1000:
            if amount % 10000 == 0:
                risk_score += 0.10
                reasons.append("Large round amount detected")
            elif amount % 1000 == 0:
                risk_score += 0.05
                reasons.append("Round amount (multiple of ₹1,000)")
        
        # Amounts like 9999, 49999, 99999 (just below round thresholds)
        for t in [10000, 50000, 100000, 500000, 1000000]:
            if t - 100 <= amount <= t - 1:
                risk_score += 0.15
                reasons.append(
                    f"Amount just below {self._format_amount(t, currency)} — "
                    f"common evasion pattern"
                )
                break
        
        # =====================================================================
        # Rule 3: Velocity Check (Rapid Fire Transactions)
        # =====================================================================
        if sender_id:
            recent = self._get_recent_checks(sender_id, minutes=30)
            
            if len(recent) >= 5:
                risk_score += 0.35
                reasons.append(
                    f"{len(recent)} transactions in last 30 minutes — "
                    f"rapid-fire pattern detected"
                )
            elif len(recent) >= 3:
                risk_score += 0.20
                reasons.append(
                    f"{len(recent)} transactions in last 30 minutes — "
                    f"elevated transaction velocity"
                )
            
            # Check if amounts are split (total near threshold)
            if len(recent) >= 2:
                recent_total = sum(c.get('amount', 0) for c in recent) + amount
                if recent_total > threshold * 0.8:
                    ratio = recent_total / threshold
                    risk_score += 0.25
                    reasons.append(
                        f"Combined recent total ({self._format_amount(recent_total, currency)}) "
                        f"is {ratio*100:.0f}% of threshold — "
                        f"possible split structuring"
                    )
        
        # =====================================================================
        # Rule 4: Recipient Reputation
        # =====================================================================
        if recipient:
            # Check blacklist
            if recipient in self._blacklist:
                risk_score += 0.50
                reasons.append("⚠️ Recipient is on the flagged watchlist")
            
            # Check flagged history
            if recipient in self._flagged_recipients:
                flag = self._flagged_recipients[recipient]
                risk_score += 0.30
                reasons.append(
                    f"Recipient flagged in {flag.get('count', 0)} previous checks"
                )
            
            # New recipient check
            if sender_id:
                known = self._get_known_recipients(sender_id)
                if recipient not in known:
                    risk_score += 0.05
                    reasons.append("First-time payment to this recipient")
        
        # =====================================================================
        # Rule 5: High Amount
        # =====================================================================
        if amount >= threshold * 0.5:
            risk_score += 0.10
            reasons.append(
                f"Large transaction: {self._format_amount(amount, currency)}"
            )
        
        # =====================================================================
        # Rule 6: Off-Hours Transaction
        # =====================================================================
        hour = datetime.now().hour
        if hour < 6 or hour >= 23:
            risk_score += 0.08
            reasons.append("Transaction during off-hours (unusual timing)")
        
        # =====================================================================
        # Rule 7: Sender History Analysis
        # =====================================================================
        if sender_history:
            # Check for pattern of multiple recipients
            unique_recipients = set(h.get('recipient', '') for h in sender_history[-20:])
            if len(unique_recipients) >= 5:
                risk_score += 0.15
                reasons.append(
                    f"Sender has transacted with {len(unique_recipients)} "
                    f"different recipients recently — fan-out pattern"
                )
        
        # =====================================================================
        # Final Score & Level
        # =====================================================================
        risk_score = min(risk_score, 1.0)
        
        if risk_score >= 0.7:
            risk_level = 'critical'
        elif risk_score >= 0.5:
            risk_level = 'high'
        elif risk_score >= 0.3:
            risk_level = 'medium'
        else:
            risk_level = 'low'
        
        # Record this check
        if sender_id:
            self._record_check(sender_id, recipient, amount, risk_score, risk_level)
        
        # Update recipient flag count if suspicious
        if risk_score >= 0.3 and recipient:
            if recipient not in self._flagged_recipients:
                self._flagged_recipients[recipient] = {'count': 0, 'first_flagged': datetime.now().isoformat()}
            self._flagged_recipients[recipient]['count'] += 1
        
        return {
            'riskScore': risk_score,
            'riskLevel': risk_level,
            'reasons': reasons,
            'message': f"{len(reasons)} risk indicator(s) detected" if reasons else "No risk indicators detected",
            'checkedAt': datetime.now().isoformat(),
        }
    
    async def report_transaction(
        self,
        recipient: str,
        amount: float,
        platform: str,
        risk_score: float,
        reasons: List[str],
        reporter_action: str = 'cancelled',
    ) -> Dict:
        """Record a user report of a suspicious transaction."""
        # Add to flagged recipients
        if recipient:
            if recipient not in self._flagged_recipients:
                self._flagged_recipients[recipient] = {
                    'count': 0,
                    'first_flagged': datetime.now().isoformat(),
                }
            self._flagged_recipients[recipient]['count'] += 1
            self._flagged_recipients[recipient]['last_reported'] = datetime.now().isoformat()
            self._flagged_recipients[recipient]['last_amount'] = amount
        
        return {
            'success': True,
            'message': 'Report recorded successfully',
            'recipientFlagCount': self._flagged_recipients.get(recipient, {}).get('count', 0),
        }
    
    async def get_check_history(
        self,
        sender_id: str,
        limit: int = 50,
    ) -> List[Dict]:
        """Get transaction check history for a sender."""
        checks = self._recent_checks.get(sender_id, [])
        return checks[-limit:]
    
    async def get_stats(self) -> Dict:
        """Get global threat statistics."""
        total_checks = sum(len(v) for v in self._recent_checks.values())
        total_flagged = sum(1 for checks in self._recent_checks.values()
                          for c in checks if c.get('risk_score', 0) >= 0.3)
        
        return {
            'totalChecks': total_checks,
            'totalFlagged': total_flagged,
            'flaggedRecipients': len(self._flagged_recipients),
            'blacklistedRecipients': len(self._blacklist),
            'flagRate': total_flagged / max(total_checks, 1),
        }
    
    # =========================================================================
    # Internal Helpers
    # =========================================================================
    
    def _get_recent_checks(self, sender_id: str, minutes: int = 30) -> List[Dict]:
        """Get recent checks for a sender within time window."""
        cutoff = datetime.now() - timedelta(minutes=minutes)
        checks = self._recent_checks.get(sender_id, [])
        return [c for c in checks if datetime.fromisoformat(c['timestamp']) > cutoff]
    
    def _get_known_recipients(self, sender_id: str) -> set:
        """Get set of known recipients for a sender."""
        checks = self._recent_checks.get(sender_id, [])
        return set(c.get('recipient', '') for c in checks)
    
    def _record_check(self, sender_id: str, recipient: str, amount: float,
                     risk_score: float, risk_level: str):
        """Record a check in history."""
        self._recent_checks[sender_id].append({
            'recipient': recipient,
            'amount': amount,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'timestamp': datetime.now().isoformat(),
        })
        
        # Limit history per sender
        if len(self._recent_checks[sender_id]) > 200:
            self._recent_checks[sender_id] = self._recent_checks[sender_id][-200:]
    
    def _format_amount(self, amount: float, currency: str = 'INR') -> str:
        """Format amount with currency symbol."""
        symbols = {'INR': '₹', 'USD': '$', 'EUR': '€', 'GBP': '£'}
        symbol = symbols.get(currency, currency + ' ')
        return f"{symbol}{amount:,.0f}"


# Global service instance
safeguard_service = SafeguardService()
