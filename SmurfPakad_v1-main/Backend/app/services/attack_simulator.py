"""
Attack Simulator Service - Generates realistic smurfing attack sequences for live demos
"""
import asyncio
import random
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, AsyncGenerator, Optional
from enum import Enum
from dataclasses import dataclass, field
import json

from app.core.websocket import ws_manager


class AttackPattern(str, Enum):
    FAN_OUT = "fan_out"
    LAYERING = "layering"
    PEEL_CHAIN = "peel_chain"
    CIRCULAR = "circular"
    SMURFING = "smurfing"


class EventType(str, Enum):
    TX_RECEIVED = "tx_received"
    TX_SENT = "tx_sent"
    WALLET_FLAGGED = "wallet_flagged"
    PATTERN_DETECTED = "pattern_detected"
    ALERT_RAISED = "alert_raised"
    STAGE_COMPLETE = "stage_complete"
    COMPLETE = "complete"


@dataclass
class Wallet:
    address: str
    label: str
    type: str  # source, mule, collector, exchange
    risk: float = 0.0
    flagged: bool = False
    balance: float = 0.0
    color: str = "#10b981"  # green default


@dataclass
class TransactionEvent:
    id: str
    timestamp: float  # seconds from start
    type: EventType
    from_wallet: str
    to_wallet: str
    amount: float
    wallet_updates: Dict[str, Dict] = field(default_factory=dict)
    pattern_info: Optional[Dict] = None
    alert_info: Optional[Dict] = None


class SmurfingAttackSimulator:
    """
    Generates cinematic smurfing attack sequences for live demos.
    
    Attack Flow (20 seconds):
    0-2s:   Source wallet receives large sum
    2-8s:   Fan-out to 5 mule wallets (structured amounts)
    8-14s:  Mules forward to collector wallet
    14-16s: Collector cashes out to exchange
    16-18s: Pattern detection triggers
    18-20s: All wallets flagged, alert raised
    """
    
    def __init__(self):
        self.wallets: Dict[str, Wallet] = {}
        self.events: List[TransactionEvent] = []
        self.running = False
        self.pattern = AttackPattern.SMURFING
        self.duration = 20.0
        self._event_callbacks: List[callable] = []
    
    def register_callback(self, callback: callable):
        """Register callback for real-time event streaming"""
        self._event_callbacks.append(callback)
    
    def _emit(self, event: TransactionEvent):
        """Emit event to all registered callbacks"""
        for cb in self._event_callbacks:
            try:
                cb(event)
            except Exception as e:
                print(f"Callback error: {e}")
    
    async def _broadcast_ws(self, event: TransactionEvent):
        """Broadcast event via WebSocket to all connected clients"""
        await ws_manager.broadcast_attack_simulation({
            "event": {
                "id": event.id,
                "timestamp": event.timestamp,
                "type": event.type.value,
                "from_wallet": event.from_wallet,
                "to_wallet": event.to_wallet,
                "amount": event.amount,
                "wallet_updates": event.wallet_updates,
                "pattern_info": event.pattern_info,
                "alert_info": event.alert_info,
            }
        })
    
    def setup_scenario(self, pattern: AttackPattern = AttackPattern.SMURFING):
        """Initialize wallet network for the attack pattern"""
        self.pattern = pattern
        self.wallets = {}
        self.events = []
        
        if pattern == AttackPattern.SMURFING or pattern == AttackPattern.FAN_OUT:
            # Source wallet (receives large amount)
            self.wallets["source"] = Wallet(
                address="0x742d35Cc6634C0532925a3b844Bc9e7595f8fEb1",
                label="Source Wallet",
                type="source",
                color="#3b82f6",  # blue
                balance=0
            )
            
            # Mule wallets (5 wallets)
            mule_addresses = [
                "0x1a2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d",
                "0x2b3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e",
                "0x3c4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f",
                "0x4d5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f78",
                "0x5e6f78901a2b3c4d5e6f78901a2b3c4d5e6f7890",
            ]
            
            for i, addr in enumerate(mule_addresses):
                self.wallets[f"mule_{i+1}"] = Wallet(
                    address=addr,
                    label=f"Mule Wallet {i+1}",
                    type="mule",
                    color="#f59e0b",  # amber
                    balance=0
                )
            
            # Collector wallet
            self.wallets["collector"] = Wallet(
                address="0x9f8e7d6c5b4a39281706fedcba9876543210fedc",
                label="Collector Wallet",
                type="collector",
                color="#ef4444",  # red
                balance=0
            )
            
            # Exchange wallet
            self.wallets["exchange"] = Wallet(
                address="0xabcdef1234567890abcdef1234567890abcdef12",
                label="Exchange Deposit",
                type="exchange",
                color="#8b5cf6",  # purple
                balance=0
            )
        
        elif pattern == AttackPattern.LAYERING:
            # Complex layering chain
            self.wallets["source"] = Wallet(
                address="0x1111111111111111111111111111111111111111",
                label="Source",
                type="source",
                color="#3b82f6",
                balance=0
            )
            
            for i in range(6):
                self.wallets[f"layer_{i+1}"] = Wallet(
                    address=f"0x{i+2}{'0' * 39}{i+2}",
                    label=f"Layer {i+1}",
                    type="intermediary",
                    color="#f59e0b",
                    balance=0
                )
            
            self.wallets["collector"] = Wallet(
                address="0x9999999999999999999999999999999999999999",
                label="Final Collector",
                type="collector",
                color="#ef4444",
                balance=0
            )
        
        elif pattern == AttackPattern.CIRCULAR:
            # Circular flow
            for i in range(4):
                self.wallets[f"node_{i+1}"] = Wallet(
                    address=f"0x{i+1}{'a' * 39}",
                    label=f"Node {i+1}",
                    type="circular",
                    color="#ec4899",  # pink
                    balance=0
                )
    
    def get_wallet_state(self) -> Dict[str, Any]:
        """Get current state of all wallets for visualization"""
        return {
            k: {
                "address": v.address,
                "label": v.label,
                "type": v.type,
                "risk": v.risk,
                "flagged": v.flagged,
                "balance": v.balance,
                "color": v.color
            }
            for k, v in self.wallets.items()
        }
    
    async def run_simulation(
        self, 
        pattern: AttackPattern = AttackPattern.SMURFING, 
        duration: float = 20.0
    ) -> AsyncGenerator[TransactionEvent, None]:
        """Run the attack simulation, yielding events in real-time"""
        self.running = True
        self.setup_scenario(pattern)
        self.duration = duration
        
        start_time = asyncio.get_event_loop().time()
        
        if pattern == AttackPattern.SMURFING or pattern == AttackPattern.FAN_OUT:
            async for event in self._run_smurfing_scenario(start_time):
                if not self.running:
                    break
                yield event
        elif pattern == AttackPattern.LAYERING:
            async for event in self._run_layering_scenario(start_time):
                if not self.running:
                    break
                yield event
        elif pattern == AttackPattern.CIRCULAR:
            async for event in self._run_circular_scenario(start_time):
                if not self.running:
                    break
                yield event
        
        # Final complete event
        final_event = TransactionEvent(
            id=str(uuid.uuid4()),
            timestamp=duration,
            type=EventType.COMPLETE,
            from_wallet="",
            to_wallet="",
            amount=0,
            pattern_info={"pattern": pattern.value, "total_wallets": len(self.wallets), "total_flagged": sum(1 for w in self.wallets.values() if w.flagged)}
        )
        self._emit(final_event)
        await self._broadcast_ws(final_event)
        yield final_event
    
    async def _run_smurfing_scenario(self, start_time: float) -> AsyncGenerator[TransactionEvent, None]:
        """Run the classic smurfing fan-out scenario"""
        
        # Stage 1: Source receives large amount (0-2s)
        await self._wait_for_time(start_time, 0.5)
        yield await self._create_event(
            EventType.TX_RECEIVED,
            "external", "source",
            5000000,  # ₹50 Lakhs
            {"source": {"balance": 5000000, "risk": 0.1}}
        )
        
        await self._wait_for_time(start_time, 1.5)
        yield await self._create_event(
            EventType.STAGE_COMPLETE,
            "", "",
            0,
            {},
            {"stage": "source_funded", "message": "Source wallet funded with ₹50L"}
        )
        
        # Stage 2: Fan-out to mules (2-8s)
        mule_amounts = [850000, 720000, 910000, 680000, 840000]  # Structured amounts
        mule_keys = [f"mule_{i+1}" for i in range(5)]
        
        for i, (mule_key, amount) in enumerate(zip(mule_keys, mule_amounts)):
            await self._wait_for_time(start_time, 2 + i * 1.2)
            
            # Update source balance
            source_bal = self.wallets["source"].balance - amount
            self.wallets["source"].balance = source_bal
            self.wallets[mule_key].balance = amount
            self.wallets[mule_key].risk = 0.3
            
            yield await self._create_event(
                EventType.TX_SENT,
                "source", mule_key,
                amount,
                {
                    "source": {"balance": source_bal, "risk": 0.15},
                    mule_key: {"balance": amount, "risk": 0.3, "flagged": False}
                }
            )
            
            # Brief pause between transactions
            await asyncio.sleep(0.3)
        
        # Stage 3: Mules forward to collector (8-14s)
        await self._wait_for_time(start_time, 8.5)
        yield await self._create_event(
            EventType.STAGE_COMPLETE,
            "", "",
            0,
            {},
            {"stage": "fan_out_complete", "message": "Fan-out complete. 5 mules funded."}
        )
        
        total_collected = 0
        for i, mule_key in enumerate(mule_keys):
            await self._wait_for_time(start_time, 8.5 + i * 1.0)
            amount = mule_amounts[i]
            total_collected += amount
            
            # Mule sends to collector
            self.wallets[mule_key].balance = 0
            self.wallets[mule_key].risk = 0.7
            self.wallets[mule_key].flagged = True
            self.wallets[mule_key].color = "#ef4444"
            
            self.wallets["collector"].balance = total_collected
            self.wallets["collector"].risk = min(0.5 + (i * 0.1), 0.9)
            
            yield await self._create_event(
                EventType.TX_SENT,
                mule_key, "collector",
                amount,
                {
                    mule_key: {"balance": 0, "risk": 0.85, "flagged": True, "color": "#ef4444"},
                    "collector": {"balance": total_collected, "risk": self.wallets["collector"].risk}
                }
            )
            
            # Flag the mule wallet
            yield await self._create_event(
                EventType.WALLET_FLAGGED,
                mule_key, "",
                0,
                {mule_key: {"risk": 0.85, "flagged": True, "flags": ["Structured amount", "Rapid forward", "Known mule pattern"]}},
                {"wallet": mule_key, "severity": "high", "reason": "Smurfing mule detected"}
            )
            
            await asyncio.sleep(0.2)
        
        # Stage 4: Collector cashes out (14-16s)
        await self._wait_for_time(start_time, 14.5)
        
        self.wallets["collector"].balance = 0
        self.wallets["collector"].risk = 0.95
        self.wallets["collector"].flagged = True
        self.wallets["collector"].color = "#ef4444"
        self.wallets["exchange"].balance = total_collected
        
        yield await self._create_event(
            EventType.TX_SENT,
            "collector", "exchange",
            total_collected,
            {
                "collector": {"balance": 0, "risk": 0.95, "flagged": True, "color": "#ef4444"},
                "exchange": {"balance": total_collected, "risk": 0.2}
            }
        )
        
        # Flag collector
        yield await self._create_event(
            EventType.WALLET_FLAGGED,
            "collector", "",
            0,
            {"collector": {"risk": 0.95, "flagged": True, "flags": ["Aggregated from 5 mules", "Large cash-out", "Circular flow detected"]}},
            {"wallet": "collector", "severity": "critical", "reason": "Primary collector identified"}
        )
        
        # Stage 5: Pattern detection (16-18s)
        await self._wait_for_time(start_time, 16.5)
        
        yield await self._create_event(
            EventType.PATTERN_DETECTED,
            "", "",
            0,
            {},
            {
                "pattern": "smurfing",
                "type": "Smurfing Fan-Out",
                "severity": "critical",
                "confidence": 0.94,
                "wallets_involved": ["source"] + mule_keys + ["collector"],
                "description": "5 mules detected splitting ₹50L into structured amounts and forwarding to single collector"
            }
        )
        
        # Stage 6: Alert raised (18-20s)
        await self._wait_for_time(start_time, 18.0)
        
        yield await self._create_event(
            EventType.ALERT_RAISED,
            "", "",
            0,
            {},
            {
                "alert_id": f"ALERT-{uuid.uuid4().hex[:8].upper()}",
                "severity": "critical",
                "title": "Smurfing Network Detected",
                "description": "6 wallets flagged in coordinated smurfing operation. ₹40L traced to exchange.",
                "action_required": "Immediate SAR filing recommended"
            }
        )
    
    async def _run_layering_scenario(self, start_time: float) -> AsyncGenerator[TransactionEvent, None]:
        """Run layering chain scenario"""
        # Similar structure but with 6-layer chain
        await self._wait_for_time(start_time, 0.5)
        yield await self._create_event(
            EventType.TX_RECEIVED,
            "external", "source",
            3000000,
            {"source": {"balance": 3000000, "risk": 0.1}}
        )
        
        for i in range(6):
            await self._wait_for_time(start_time, 1.5 + i * 2.5)
            from_key = "source" if i == 0 else f"layer_{i}"
            to_key = f"layer_{i+1}"
            amount = 3000000 * (0.85 ** (i + 1))  # Peel chain decay
            
            self.wallets[from_key].balance -= amount
            self.wallets[to_key].balance = amount
            self.wallets[to_key].risk = 0.3 + (i * 0.1)
            
            yield await self._create_event(
                EventType.TX_SENT,
                from_key, to_key,
                amount,
                {
                    from_key: {"balance": self.wallets[from_key].balance, "risk": 0.2 + i * 0.05},
                    to_key: {"balance": amount, "risk": 0.3 + i * 0.1}
                }
            )
        
        await self._wait_for_time(start_time, 18.0)
        yield await self._create_event(
            EventType.PATTERN_DETECTED,
            "", "",
            0,
            {},
            {
                "pattern": "layering",
                "type": "Peel Chain Layering",
                "severity": "high",
                "confidence": 0.87,
                "description": "6-layer peel chain detected with 15% decay per hop"
            }
        )
    
    async def _run_circular_scenario(self, start_time: float) -> AsyncGenerator[TransactionEvent, None]:
        """Run circular flow scenario"""
        nodes = ["node_1", "node_2", "node_3", "node_4"]
        
        await self._wait_for_time(start_time, 0.5)
        yield await self._create_event(
            EventType.TX_RECEIVED,
            "external", "node_1",
            1000000,
            {"node_1": {"balance": 1000000, "risk": 0.1}}
        )
        
        for round_num in range(2):
            for i in range(4):
                await self._wait_for_time(start_time, 2 + round_num * 8 + i * 2)
                from_key = nodes[i]
                to_key = nodes[(i + 1) % 4]
                amount = 1000000 * (0.95 ** (round_num * 4 + i))
                
                self.wallets[from_key].balance -= amount
                self.wallets[to_key].balance += amount
                self.wallets[to_key].risk = min(0.3 + (round_num * 0.2) + (i * 0.05), 0.9)
                
                yield await self._create_event(
                    EventType.TX_SENT,
                    from_key, to_key,
                    amount,
                    {
                        from_key: {"balance": self.wallets[from_key].balance, "risk": 0.2 + round_num * 0.15},
                        to_key: {"balance": self.wallets[to_key].balance, "risk": self.wallets[to_key].risk}
                    }
                )
        
        await self._wait_for_time(start_time, 18.0)
        yield await self._create_event(
            EventType.PATTERN_DETECTED,
            "", "",
            0,
            {},
            {
                "pattern": "circular",
                "type": "Circular Flow",
                "severity": "high",
                "confidence": 0.82,
                "description": "2-round circular flow detected across 4 nodes"
            }
        )
    
    async def _wait_for_time(self, start_time: float, target_seconds: float):
        """Wait until target time in simulation"""
        elapsed = asyncio.get_event_loop().time() - start_time
        wait_time = target_seconds - elapsed
        if wait_time > 0:
            await asyncio.sleep(wait_time)
    
    async def _create_event(
        self,
        event_type: EventType,
        from_wallet: str,
        to_wallet: str,
        amount: float,
        wallet_updates: Dict[str, Dict],
        extra: Dict = None
    ) -> TransactionEvent:
        event = TransactionEvent(
            id=str(uuid.uuid4()),
            timestamp=asyncio.get_event_loop().time(),
            type=event_type,
            from_wallet=from_wallet,
            to_wallet=to_wallet,
            amount=amount,
            wallet_updates=wallet_updates,
            pattern_info=extra if extra and "pattern" in str(extra) else None,
            alert_info=extra if extra and ("alert" in str(extra) or "severity" in str(extra)) else None
        )
        
        self.events.append(event)
        self._emit(event)
        await self._broadcast_ws(event)
        
        return event
    
    def stop(self):
        self.running = False


# Global simulator instance
attack_simulator = SmurfingAttackSimulator()