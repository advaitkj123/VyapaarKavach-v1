#!/usr/bin/env python3
"""
Synthetic Transaction Dataset Generator for SmurfPakad Demo

This script generates realistic synthetic transaction data that mimics:
1. Normal human payment behavior on Indian payment systems (UPI, Paytm, PhonePe, GPay, BHIM)
2. Fraudulent patterns: Smurfing/Structuring, Layering, Circular flows, Velocity spikes

Output format matches SmurfPakad expected CSV format:
Source_Wallet_ID, Dest_Wallet_ID, Timestamp, Amount, Token_Type

Author: SmurfPakad Team
"""

import csv
import random
import uuid
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import List, Dict, Tuple
from enum import Enum
import math

# ============================================================================
# CONFIGURATION
# ============================================================================

class Platform(Enum):
    PAYTM = "paytm"
    PHONEPE = "phonepe"
    GPAY = "gpay"
    BHIM = "bhim"
    UPI = "upi"

class TokenType(Enum):
    INR = "INR"
    UPI = "UPI"

class TransactionType(Enum):
    NORMAL = "normal"
    SMURFING = "smurfing"
    LAYERING = "layering"
    CIRCULAR = "circular"
    VELOCITY_SPIKE = "velocity_spike"

# Indian UPI ID format: username@platform
PLATFORMS = [p.value for p in Platform]

# Realistic name pools for generating wallet IDs
FIRST_NAMES = [
    "rahul", "priya", "amit", "sneha", "vikram", "anita", "rajesh", "pooja",
    "arjun", "kavya", "sanjay", "meera", "rohit", "divya", "manish", "shreya",
    "akash", "neha", "suresh", "ananya", "deepak", "kavita", "rahul", "sonia",
    "amit", "swati", "vijay", "riya", "mohan", "alisha", "raj", "tanvi"
]

LAST_NAMES = [
    "sharma", "verma", "gupta", "singh", "kumar", "agarwal", "jain", "malhotra",
    "patel", "shah", "reddy", "nair", "iyer", "rao", "mehta", "desai",
    "chopra", "bansal", "mittal", "goel", "garg", "sethi", "arora", "chawla"
]

MERCHANTS = {
    "grocery": ["bigbasket", "grofers", "dmart", "reliance_fresh", "more", "spencers"],
    "food": ["swiggy", "zomato", "dominos", "pizza_hut", "mcdonalds", "kfc", "subway"],
    "transport": ["uber", "ola", "rapido", "metro", "bus", "irctc"],
    "shopping": ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho"],
    "bills": ["airtel", "jio", "vodafone", "bsnl", "electricity", "water", "gas"],
    "entertainment": ["netflix", "prime_video", "hotstar", "sony_liv", "zee5", "bookmyshow"],
    "fuel": ["hp", "bpcl", "iocl", "shell", "reliance_petrol"],
    "health": ["apollo", "pharmeasy", "1mg", "netmeds", "practo"],
    "education": ["udemy", "coursera", "unacademy", "byjus", "vedantu"],
    "other": ["salary", "transfer", "rent", "emi", "insurance", "investment", "gift"]
}

# Normal transaction amount ranges by category (in INR)
AMOUNT_RANGES = {
    "grocery": (100, 3000),
    "food": (100, 1500),
    "transport": (20, 500),
    "shopping": (200, 10000),
    "bills": (100, 5000),
    "entertainment": (50, 2000),
    "fuel": (200, 3000),
    "health": (100, 5000),
    "education": (500, 50000),
    "other": (500, 50000)
}

# ============================================================================
# HELPER CLASSES
# ============================================================================

@dataclass
class Wallet:
    wallet_id: str
    platform: str
    user_type: str  # "normal", "merchant", "mule", "collector"
    created_at: datetime
    risk_score: float = 0.0

@dataclass
class Transaction:
    source_wallet_id: str
    dest_wallet_id: str
    timestamp: datetime
    amount: float
    token_type: str
    tx_type: TransactionType = TransactionType.NORMAL
    category: str = "other"

# ============================================================================
# WALLET GENERATION
# ============================================================================

def generate_wallet_id(platform: str = None, user_type: str = "normal") -> str:
    """Generate realistic UPI wallet ID"""
    if platform is None:
        platform = random.choice(PLATFORMS)
    
    if user_type == "merchant":
        prefix = f"merchant_{random.randint(1000, 9999)}"
    elif user_type == "mule":
        prefix = f"mule_{random.randint(100, 999)}"
    elif user_type == "collector":
        prefix = f"collector_{random.randint(100, 999)}"
    else:
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        num = random.randint(100, 9999)
        prefix = f"{first}_{last}{num}"
    
    return f"{prefix}@{platform}"

def generate_wallet_pool(n_normal: int = 200, n_merchants: int = 30, 
                         n_mules: int = 15, n_collectors: int = 8) -> List[Wallet]:
    """Generate a pool of wallets with different user types"""
    wallets = []
    
    # Normal users
    for _ in range(n_normal):
        wallets.append(Wallet(
            wallet_id=generate_wallet_id(user_type="normal"),
            platform=random.choice(PLATFORMS),
            user_type="normal",
            created_at=datetime.now() - timedelta(days=random.randint(30, 365))
        ))
    
    # Merchants
    for _ in range(n_merchants):
        wallets.append(Wallet(
            wallet_id=generate_wallet_id(user_type="merchant"),
            platform=random.choice(PLATFORMS),
            user_type="merchant",
            created_at=datetime.now() - timedelta(days=random.randint(60, 730))
        ))
    
    # Mules (used in smurfing)
    for _ in range(n_mules):
        wallets.append(Wallet(
            wallet_id=generate_wallet_id(user_type="mule"),
            platform=random.choice(PLATFORMS),
            user_type="mule",
            created_at=datetime.now() - timedelta(days=random.randint(7, 60)),
            risk_score=random.uniform(0.6, 0.9)
        ))
    
    # Collectors (end of smurfing chain)
    for _ in range(n_collectors):
        wallets.append(Wallet(
            wallet_id=generate_wallet_id(user_type="collector"),
            platform=random.choice(PLATFORMS),
            user_type="collector",
            created_at=datetime.now() - timedelta(days=random.randint(30, 180)),
            risk_score=random.uniform(0.7, 0.95)
        ))
    
    return wallets

# ============================================================================
# NORMAL TRANSACTION GENERATION
# ============================================================================

def generate_normal_transaction(wallets: List[Wallet], start_time: datetime) -> Transaction:
    """Generate a normal human-like transaction"""
    sender = random.choice([w for w in wallets if w.user_type == "normal"])
    
    # 70% to merchants, 25% to other normal users, 5% to other
    dest_type = random.choices(["merchant", "normal", "other"], weights=[0.7, 0.25, 0.05])[0]
    
    if dest_type == "merchant":
        dest = random.choice([w for w in wallets if w.user_type == "merchant"])
        category = random.choice(list(MERCHANTS.keys()))
    elif dest_type == "normal":
        dest = random.choice([w for w in wallets if w.user_type == "normal" and w.wallet_id != sender.wallet_id])
        category = random.choice(["food", "transport", "shopping", "bills", "other"])
    else:
        dest = random.choice(wallets)
        category = "other"
    
    # Amount based on category with realistic distribution
    min_amt, max_amt = AMOUNT_RANGES.get(category, (100, 5000))
    # Log-normal distribution for realistic amounts
    amount = random.lognormvariate(math.log((min_amt + max_amt) / 2), 0.5)
    amount = max(min_amt, min(max_amt, round(amount, 2)))
    
    # Realistic timing - most transactions during day, fewer at night
    hour = random.choices(
        range(24),
        weights=[0.5, 0.3, 0.2, 0.2, 0.3, 0.8, 1.5, 3, 5, 8, 10, 12, 
                 12, 10, 8, 7, 8, 10, 12, 10, 8, 5, 2, 1]
    )[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    
    timestamp = start_time.replace(hour=hour, minute=minute, second=second)
    
    return Transaction(
        source_wallet_id=sender.wallet_id,
        dest_wallet_id=dest.wallet_id,
        timestamp=timestamp,
        amount=amount,
        token_type="UPI",
        category=category
    )

# ============================================================================
# FRAUD PATTERN GENERATION
# ============================================================================

def generate_smurfer_transactions(wallets: List[Wallet], start_time: datetime) -> List[Transaction]:
    """
    Smurfing/Structuring: Large amount split into multiple sub-threshold transactions
    to avoid reporting thresholds (₹10K for UPI, ₹50K for bank)
    """
    transactions = []
    
    # Select collector and mules
    collectors = [w for w in wallets if w.user_type == "collector"]
    mules = [w for w in wallets if w.user_type == "mule"]
    sources = [w for w in wallets if w.user_type == "normal"]
    
    if not collectors or not mules or not sources:
        return transactions
    
    collector = random.choice(collectors)
    num_mules = random.randint(4, 8)
    selected_mules = random.sample(mules, min(num_mules, len(mules)))
    
    # Large amount to be split (₹50K - ₹5L)
    total_amount = random.randint(50000, 500000)
    
    # Split into sub-threshold amounts (₹8K - ₹9,999 to avoid ₹10K threshold)
    remaining = total_amount
    num_splits = random.randint(6, 12)
    
    # Stage 1: Sources send to mules (fan-out)
    for i in range(num_splits):
        if remaining <= 8000:
            break
        
        # Amount just below ₹10K threshold with some variance
        amt = min(random.randint(8000, 9999), remaining)
        remaining -= amt
        
        source = random.choice(sources)
        mule = random.choice(selected_mules)
        
        # Tight time window (all within 1-2 hours)
        minutes_offset = random.randint(0, 120)
        timestamp = start_time + timedelta(minutes=minutes_offset)
        
        transactions.append(Transaction(
            source_wallet_id=source.wallet_id,
            dest_wallet_id=mule.wallet_id,
            timestamp=timestamp,
            amount=amt,
            token_type="UPI",
            tx_type=TransactionType.SMURFING,
            category="smurfing_source_to_mule"
        ))
    
    # Stage 2: Mules forward to collector (fan-in)
    for mule in selected_mules:
        # Mule forwards most of what it received
        forward_amt = random.randint(8000, 9999)
        minutes_offset = random.randint(120, 180)  # 2-3 hours later
        timestamp = start_time + timedelta(minutes=minutes_offset)
        
        transactions.append(Transaction(
            source_wallet_id=mule.wallet_id,
            dest_wallet_id=collector.wallet_id,
            timestamp=timestamp,
            amount=forward_amt,
            token_type="UPI",
            tx_type=TransactionType.SMURFING,
            category="smurfing_mule_to_collector"
        ))
    
    # Stage 3: Collector cashes out (large amount to exchange/bank)
    cashout_amt = sum(t.amount for t in transactions if t.category == "smurfing_mule_to_collector")
    timestamp = start_time + timedelta(minutes=random.randint(200, 300))
    
    transactions.append(Transaction(
        source_wallet_id=collector.wallet_id,
        dest_wallet_id=random.choice([w for w in wallets if w.user_type == "merchant"]).wallet_id,
        timestamp=timestamp,
        amount=cashout_amt,
        token_type="UPI",
        tx_type=TransactionType.SMURFING,
        category="smurfing_cashout"
    ))
    
    return transactions

def generate_layering_transactions(wallets: List[Wallet], start_time: datetime) -> List[Transaction]:
    """
    Layering: Complex chain of transactions to obscure origin
    Multiple hops through intermediary wallets
    """
    transactions = []
    
    # Create a chain of 4-6 hops
    chain_length = random.randint(4, 6)
    
    # Start with a normal user as source
    normal_wallets = [w for w in wallets if w.user_type == "normal"]
    if not normal_wallets:
        return transactions
    
    source = random.choice(normal_wallets)
    
    # Select intermediary wallets (mix of mules and normal)
    available_intermediaries = [w for w in wallets if w.wallet_id != source.wallet_id]
    
    # Ensure we have enough intermediaries
    max_chain = min(chain_length - 1, len(available_intermediaries))
    if max_chain < 3:
        return transactions
    
    chain_length = random.randint(4, max_chain + 1)
    intermediaries = random.sample(
        available_intermediaries,
        chain_length - 1
    )
    
    # Final destination is a collector
    collectors = [w for w in wallets if w.user_type == "collector"]
    if not collectors:
        return transactions
    
    collector = random.choice(collectors)
    
    chain = [source] + intermediaries + [collector]
    amount = random.randint(20000, 200000)
    
    for i in range(len(chain) - 1):
        # Slight amount decay (fees, small keep-back)
        decay = random.uniform(0.95, 0.99)
        amount = round(amount * decay, 2)
        
        # Time gaps: 5-30 minutes between hops
        minutes_gap = random.randint(5, 30)
        timestamp = start_time + timedelta(minutes=sum(random.randint(5, 30) for _ in range(i + 1)))
        
        transactions.append(Transaction(
            source_wallet_id=chain[i].wallet_id,
            dest_wallet_id=chain[i + 1].wallet_id,
            timestamp=timestamp,
            amount=amount,
            token_type="UPI",
            tx_type=TransactionType.LAYERING,
            category="layering"
        ))
    
    return transactions

def generate_circular_transactions(wallets: List[Wallet], start_time: datetime) -> List[Transaction]:
    """
    Circular flow: A -> B -> C -> A (or longer cycles)
    Used to obscure money trail
    """
    transactions = []
    
    # Create 3-5 wallet cycle
    cycle_size = random.randint(3, 5)
    cycle_wallets = random.sample(wallets, cycle_size)
    
    amount = random.randint(10000, 100000)
    current_time = start_time
    
    for i in range(cycle_size):
        source = cycle_wallets[i]
        dest = cycle_wallets[(i + 1) % cycle_size]
        
        # Slight amount variation
        amount = round(amount * random.uniform(0.95, 1.05), 2)
        
        minutes_gap = random.randint(10, 60)
        current_time += timedelta(minutes=minutes_gap)
        
        transactions.append(Transaction(
            source_wallet_id=cycle_wallets[i].wallet_id,
            dest_wallet_id=cycle_wallets[(i + 1) % cycle_size].wallet_id,
            timestamp=current_time,
            amount=amount,
            token_type="UPI",
            tx_type=TransactionType.CIRCULAR,
            category="circular_flow"
        ))
    
    return transactions

def generate_velocity_spike(wallets: List[Wallet], start_time: datetime) -> List[Transaction]:
    """
    Velocity spike: Burst of transactions in short time window
    """
    transactions = []
    
    sender = random.choice([w for w in wallets if w.user_type == "normal"])
    recipients = random.sample([w for w in wallets if w.wallet_id != sender.wallet_id], 
                              random.randint(8, 15))
    
    # 15-30 transactions within 5-10 minutes
    num_txns = random.randint(15, 30)
    time_window = 600  # 10 minutes
    
    for i in range(num_txns):
        dest = random.choice([w for w in wallets if w.user_type in ["merchant", "normal"]])
        amount = random.randint(100, 5000)
        
        timestamp = start_time + timedelta(seconds=random.randint(0, time_window))
        
        transactions.append(Transaction(
            source_wallet_id=sender.wallet_id,
            dest_wallet_id=dest.wallet_id,
            timestamp=timestamp,
            amount=amount,
            token_type="UPI",
            tx_type=TransactionType.VELOCITY_SPIKE,
            category="velocity_spike"
        ))
    
    return transactions

# ============================================================================
# MAIN GENERATION
# ============================================================================

def generate_dataset(
    num_normal_users: int = 200,
    num_merchants: int = 30,
    num_mules: int = 15,
    num_collectors: int = 8,
    days_span: int = 30,
    transactions_per_day: int = 500,
    fraud_ratio: float = 0.15  # 15% fraudulent transactions
) -> List[Transaction]:
    """Generate complete synthetic dataset"""
    
    print("Generating wallet pool...")
    wallets = generate_wallet_pool(num_normal_users, num_merchants, num_mules, num_collectors)
    print(f"Created {len(wallets)} wallets")
    
    all_transactions = []
    start_date = datetime.now() - timedelta(days=days_span)
    
    print(f"Generating {days_span} days of transactions...")
    
    for day in range(days_span):
        day_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_span - day)
        
        # Daily normal transactions
        daily_normal = int(transactions_per_day * (1 - fraud_ratio))
        for _ in range(daily_normal):
            tx = generate_normal_transaction(wallets, start_date + timedelta(days=day))
            tx.timestamp = day_start + timedelta(seconds=random.randint(0, 86399))
            all_transactions.append(tx)
        
        # Fraud transactions (spread across days)
        daily_fraud = int(transactions_per_day * fraud_ratio)
        if daily_fraud > 0:
            fraud_types = [
                (generate_smurfer_transactions, 0.4),
                (generate_layering_transactions, 0.25),
                (generate_circular_transactions, 0.2),
                (generate_velocity_spike, 0.15)
            ]
            
            for _ in range(daily_fraud):
                fraud_func = random.choices(
                    [f for f, _ in fraud_types],
                    weights=[w for _, w in fraud_types]
                )[0]
                
                fraud_txs = fraud_func(wallets, datetime.now().replace(hour=0, minute=0, second=0) - timedelta(days=days_span - day))
                for tx in fraud_txs:
                    # Adjust timestamp to be within the day
                    tx.timestamp = day_start + timedelta(seconds=random.randint(0, 86399))
                    all_transactions.append(tx)
    
    # Sort by timestamp
    all_transactions.sort(key=lambda x: x.timestamp)
    
    print(f"Generated {len(all_transactions)} total transactions")
    return all_transactions

def write_csv(transactions: List[Transaction], filename: str):
    """Write transactions to CSV file"""
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["Source_Wallet_ID", "Dest_Wallet_ID", "Timestamp", "Amount", "Token_Type"])
        
        for tx in transactions:
            writer.writerow([
                tx.source_wallet_id,
                tx.dest_wallet_id,
                tx.timestamp.isoformat(),
                f"{tx.amount:.2f}",
                tx.token_type
            ])
    print(f"Written {len(transactions)} transactions to {filename}")

def print_statistics(transactions: List[Transaction]):
    """Print dataset statistics"""
    print("\n=== DATASET STATISTICS ===")
    print(f"Total transactions: {len(transactions)}")
    
    by_type = {}
    for tx in transactions:
        by_type[tx.tx_type.value] = by_type.get(tx.tx_type.value, 0) + 1
    
    for tx_type, count in sorted(by_type.items()):
        pct = count / len(transactions) * 100
        print(f"  {tx_type}: {count} ({pct:.1f}%)")
    
    amounts = [tx.amount for tx in transactions]
    print("\nAmount stats:")
    print(f"  Min: Rs.{min(amounts):.2f}")
    print(f"  Max: Rs.{max(amounts):.2f}")
    print(f"  Mean: Rs.{sum(amounts)/len(amounts):.2f}")
    print(f"  Median: Rs.{sorted(amounts)[len(amounts)//2]:.2f}")
    
    # Date range
    dates = [tx.timestamp for tx in transactions]
    print(f"\nDate range: {min(dates).date()} to {max(dates).date()}")

if __name__ == "__main__":
    random.seed(42)  # Reproducible results
    
    print("=" * 60)
    print("SYNTHETIC DATASET GENERATOR FOR SMURFPAKAD DEMO")
    print("=" * 60)
    
    # Generate dataset
    transactions = generate_dataset(
        num_normal_users=200,
        num_merchants=30,
        num_mules=15,
        num_collectors=8,
        days_span=30,
        transactions_per_day=400,
        fraud_ratio=0.18
    )
    
    print_statistics(transactions)
    
    # Write to CSV
    output_file = "synthetic_transactions_demo.csv"
    write_csv(transactions, output_file)
    
    print(f"\n[SUCCESS] Demo dataset ready: {output_file}")
    print("Upload this CSV to SmurfPakad for demo!")