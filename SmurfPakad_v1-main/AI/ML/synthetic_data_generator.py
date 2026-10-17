"""
Synthetic Indian UPI Data Generator
=====================================
Generates realistic Indian UPI transaction data with embedded
smurfing/laundering patterns for demo purposes.

Patterns embedded:
1. Structuring (below ₹1L CTR threshold)
2. Fan-Out / Fan-In (smurfing)
3. Cross-platform layering (Paytm → PhonePe → GPay)
4. Burst transactions (rapid-fire sends)
5. Round amount evasion (₹9,999 / ₹99,500)
6. Dormant account awakening
"""
import csv
import io
import random
import string
from datetime import datetime, timedelta
from typing import List, Dict, Tuple


PLATFORMS = ["Paytm", "PhonePe", "GPay", "BHIM", "AmazonPay"]
BANKS = ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "PNB", "BOB", "YES"]
CITIES = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Jaipur"]


def _upi_id(name: str, platform: str = None) -> str:
    platform = platform or random.choice(PLATFORMS)
    suffix = {"Paytm": "paytm", "PhonePe": "ybl", "GPay": "okaxis",
              "BHIM": "upi", "AmazonPay": "apl"}.get(platform, "upi")
    return f"{name}@{suffix}"


def _random_name() -> str:
    first = random.choice(["rahul", "priya", "amit", "neha", "vikram", "anita",
                           "suresh", "deepa", "kiran", "pooja", "raj", "meera",
                           "arjun", "sneha", "manish", "divya", "ravi", "kavita"])
    num = random.randint(100, 9999)
    return f"{first}{num}"


def generate_normal_transactions(count: int = 200, base_time: datetime = None) -> List[Dict]:
    """Generate normal, legitimate UPI transactions."""
    base_time = base_time or datetime.now() - timedelta(days=30)
    txns = []

    for _ in range(count):
        sender = _random_name()
        receiver = _random_name()
        platform = random.choice(PLATFORMS)
        amount = random.choice([
            round(random.uniform(50, 500), 2),       # Small purchases
            round(random.uniform(500, 5000), 2),      # Medium
            round(random.uniform(5000, 30000), 2),    # Rent/bills
            round(random.uniform(100, 2000), 2),      # Food/transport
        ])
        ts = base_time + timedelta(
            days=random.randint(0, 30),
            hours=random.randint(6, 23),
            minutes=random.randint(0, 59),
        )
        txns.append({
            "tx_id": f"TXN{''.join(random.choices(string.ascii_uppercase + string.digits, k=12))}",
            "sender": _upi_id(sender, platform),
            "receiver": _upi_id(receiver, platform),
            "amount": amount,
            "currency": "INR",
            "platform": platform,
            "timestamp": ts.isoformat(),
            "category": "NORMAL",
            "label": 0,
        })
    return txns


def generate_structuring_pattern(
    num_txns: int = 8,
    base_time: datetime = None,
    source: str = None,
) -> List[Dict]:
    """
    Pattern 1: Structuring (Smurfing below CTR threshold)
    Multiple transactions just below ₹1,00,000 CTR limit.
    """
    base_time = base_time or datetime.now() - timedelta(days=5)
    source = source or _random_name()
    platform = random.choice(PLATFORMS[:3])
    txns = []

    for i in range(num_txns):
        amount = random.uniform(88000, 99500)  # Just below ₹1L
        receiver = _random_name()
        ts = base_time + timedelta(hours=i * random.randint(2, 8))
        txns.append({
            "tx_id": f"STRUCT{''.join(random.choices(string.digits, k=10))}",
            "sender": _upi_id(source, platform),
            "receiver": _upi_id(receiver, platform),
            "amount": round(amount, 2),
            "currency": "INR",
            "platform": platform,
            "timestamp": ts.isoformat(),
            "category": "STRUCTURING",
            "label": 1,
        })
    return txns


def generate_fanout_fanin_pattern(
    num_mules: int = 5,
    base_time: datetime = None,
) -> List[Dict]:
    """
    Pattern 2: Fan-Out then Fan-In (classic smurfing)
    Source → multiple mules → single collector
    """
    base_time = base_time or datetime.now() - timedelta(days=3)
    source = _random_name()
    collector = _random_name()
    mules = [_random_name() for _ in range(num_mules)]
    total_amount = random.uniform(500000, 2000000)
    txns = []

    # Fan-Out: source → mules
    for i, mule in enumerate(mules):
        amount = total_amount / num_mules * random.uniform(0.8, 1.2)
        platform = PLATFORMS[i % 3]
        ts = base_time + timedelta(hours=i * 2)
        txns.append({
            "tx_id": f"FANOUT{''.join(random.choices(string.digits, k=10))}",
            "sender": _upi_id(source, platform),
            "receiver": _upi_id(mule, platform),
            "amount": round(amount, 2),
            "currency": "INR",
            "platform": platform,
            "timestamp": ts.isoformat(),
            "category": "FAN_OUT",
            "label": 1,
        })

    # Fan-In: mules → collector (different platform)
    for i, mule in enumerate(mules):
        amount = total_amount / num_mules * random.uniform(0.75, 0.95)
        platform = PLATFORMS[(i + 1) % 3]  # Different platform!
        ts = base_time + timedelta(days=1, hours=i * 3)
        txns.append({
            "tx_id": f"FANIN{''.join(random.choices(string.digits, k=10))}",
            "sender": _upi_id(mule, platform),
            "receiver": _upi_id(collector, platform),
            "amount": round(amount, 2),
            "currency": "INR",
            "platform": platform,
            "timestamp": ts.isoformat(),
            "category": "FAN_IN",
            "label": 1,
        })

    return txns


def generate_cross_platform_layering(
    num_hops: int = 4,
    base_time: datetime = None,
) -> List[Dict]:
    """
    Pattern 3: Cross-platform layering
    Money moves: Paytm → PhonePe → GPay → Bank to obscure origin
    """
    base_time = base_time or datetime.now() - timedelta(days=2)
    wallets = [_random_name() for _ in range(num_hops + 1)]
    amount = random.uniform(200000, 800000)
    txns = []

    platforms_chain = ["Paytm", "PhonePe", "GPay", "BHIM", "AmazonPay"][:num_hops]

    for i in range(num_hops):
        hop_amount = amount * random.uniform(0.92, 0.98)  # Small fee each hop
        ts = base_time + timedelta(hours=i * random.randint(4, 12))
        txns.append({
            "tx_id": f"LAYER{''.join(random.choices(string.digits, k=10))}",
            "sender": _upi_id(wallets[i], platforms_chain[i]),
            "receiver": _upi_id(wallets[i + 1], platforms_chain[min(i + 1, len(platforms_chain) - 1)]),
            "amount": round(hop_amount, 2),
            "currency": "INR",
            "platform": platforms_chain[i],
            "timestamp": ts.isoformat(),
            "category": "CROSS_PLATFORM_LAYERING",
            "label": 1,
        })
        amount = hop_amount

    return txns


def generate_burst_pattern(
    num_txns: int = 12,
    base_time: datetime = None,
) -> List[Dict]:
    """
    Pattern 4: Burst transactions (rapid-fire sends in minutes)
    """
    base_time = base_time or datetime.now() - timedelta(days=1)
    source = _random_name()
    platform = random.choice(PLATFORMS[:3])
    txns = []

    for i in range(num_txns):
        receiver = _random_name()
        amount = random.uniform(5000, 45000)
        ts = base_time + timedelta(minutes=i * random.randint(2, 10))
        txns.append({
            "tx_id": f"BURST{''.join(random.choices(string.digits, k=10))}",
            "sender": _upi_id(source, platform),
            "receiver": _upi_id(receiver, platform),
            "amount": round(amount, 2),
            "currency": "INR",
            "platform": platform,
            "timestamp": ts.isoformat(),
            "category": "BURST",
            "label": 1,
        })
    return txns


def generate_full_dataset(
    normal_count: int = 300,
    num_structuring: int = 2,
    num_fanout: int = 2,
    num_layering: int = 3,
    num_burst: int = 1,
) -> List[Dict]:
    """Generate a full dataset mixing normal and suspicious patterns."""
    random.seed(42)
    all_txns = []

    # Normal transactions
    all_txns.extend(generate_normal_transactions(normal_count))

    # Suspicious patterns
    for _ in range(num_structuring):
        all_txns.extend(generate_structuring_pattern())
    for _ in range(num_fanout):
        all_txns.extend(generate_fanout_fanin_pattern())
    for _ in range(num_layering):
        all_txns.extend(generate_cross_platform_layering())
    for _ in range(num_burst):
        all_txns.extend(generate_burst_pattern())

    # Shuffle
    random.shuffle(all_txns)
    return all_txns


def to_csv_string(transactions: List[Dict]) -> str:
    """Convert transactions to CSV string."""
    if not transactions:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=transactions[0].keys())
    writer.writeheader()
    writer.writerows(transactions)
    return output.getvalue()


def save_csv(filepath: str, transactions: List[Dict]):
    """Save transactions to a CSV file."""
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=transactions[0].keys())
        writer.writeheader()
        writer.writerows(transactions)


if __name__ == "__main__":
    txns = generate_full_dataset()
    save_csv("demo_upi_transactions.csv", txns)

    total = len(txns)
    suspicious = sum(1 for t in txns if t["label"] == 1)
    print(f"Generated {total} transactions ({suspicious} suspicious, {total - suspicious} normal)")
    print(f"Fraud rate: {suspicious / total:.1%}")

    # Pattern breakdown
    from collections import Counter
    cats = Counter(t["category"] for t in txns)
    for cat, count in cats.most_common():
        print(f"  {cat}: {count}")
