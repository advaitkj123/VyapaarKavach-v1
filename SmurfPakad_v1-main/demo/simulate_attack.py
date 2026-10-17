"""
SmurfPakad Demo Attack Simulator
=================================
Simulates a complete smurfing attack for live hackathon demonstration.

The script fires a configurable number of rapid transactions just below
the ₹1,00,000 CTR threshold through the SafeGuard /check endpoint.
Each transaction triggers the Chrome Extension warning and
a live WebSocket alert on the dashboard.

Usage:
    python simulate_attack.py              # Default demo mode (10 transactions)
    python simulate_attack.py --fast       # Fast mode for testing
    python simulate_attack.py --demo       # Presentation mode with dramatic pauses
    python simulate_attack.py --count 20   # Custom transaction count

Requires: Backend running at http://localhost:8000
"""
import asyncio
import argparse
import random
import sys
import time
from datetime import datetime

try:
    import httpx
except ImportError:
    print("❌ httpx not installed. Run: pip install httpx")
    sys.exit(1)


# ============================================================================
# Configuration
# ============================================================================

API_BASE = "http://localhost:8000/api/v1"

# Simulated smurfing amounts — just below ₹1,00,000 CTR threshold
SMURF_AMOUNTS = [
    99000, 99500, 98000, 97500, 99900, 95000, 99999, 98500, 96000, 99800,
    49999, 49500, 98900, 97000, 99100, 98700, 99300, 96500, 99600, 98200,
]

# Simulated suspicious recipient wallets
SUSPICIOUS_RECIPIENTS = [
    "mule_wallet_alpha@paytm",
    "layering_node_7x@phonepe",
    "shell_corp_staging@gpay",
    "nominee_acct_2k@paytm",
    "rapid_funnel_9z@phonepe",
    "0x7aB3...d91F",
    "0x3cE8...a42D",
    "0x9fD2...b18C",
]

# Simulated sender IDs
SENDER_IDS = [
    "user_demo_primary",
    "user_demo_secondary",
]

# Payment platforms for cross-platform simulation
PLATFORMS = ["paytm", "phonepe", "gpay"]

# Colors for terminal output
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
PURPLE = "\033[95m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_banner():
    """Print dramatic banner for demo mode."""
    print(f"""
{RED}{BOLD}
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║   🔴  SMURFING ATTACK SIMULATION — SmurfPakad Demo          ║
    ║                                                              ║
    ║   Simulating a structuring attack:                           ║
    ║   Multiple rapid transactions just below ₹1,00,000 CTR      ║
    ║   threshold across multiple payment platforms                ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
{RESET}""")


def print_transaction_result(i: int, total: int, tx: dict, result: dict):
    """Print colorized transaction result."""
    risk = result.get("riskScore", 0)
    level = result.get("riskLevel", "unknown")
    reasons = result.get("reasons", [])
    
    # Color by risk level
    if level == "critical":
        color = RED
        icon = "🔴"
    elif level == "high":
        color = YELLOW
        icon = "🟡"
    elif level == "medium":
        color = PURPLE
        icon = "🟠"
    else:
        color = GREEN
        icon = "🟢"
    
    print(f"\n{BOLD}[{i}/{total}]{RESET} {icon} {color}{level.upper()}{RESET} "
          f"— Risk: {color}{risk:.2f}{RESET}")
    print(f"   💰 ₹{tx['amount']:,.0f} → {tx['recipient'][:25]} ({tx['platform']})")
    
    for reason in reasons[:3]:
        print(f"   {CYAN}⚠  {reason}{RESET}")
    
    if risk >= 0.5:
        print(f"   {RED}{BOLD}📡 ALERT BROADCAST → Dashboard Live Threat Map{RESET}")


async def check_backend_health(client: httpx.AsyncClient) -> bool:
    """Verify the backend is running."""
    try:
        resp = await client.get(f"{API_BASE.replace('/api/v1', '')}/health", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


async def run_simulation(
    count: int = 10,
    delay: float = 2.0,
    cross_platform: bool = True,
    sender_id: str = "user_demo_primary",
):
    """
    Run the smurfing attack simulation.
    
    Args:
        count: Number of transactions to simulate
        delay: Seconds between transactions (dramatic pause for demo)
        cross_platform: If True, distribute across platforms
        sender_id: Sender identifier for velocity tracking
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Health check
        print(f"{BLUE}Checking backend connectivity...{RESET}")
        if not await check_backend_health(client):
            print(f"{RED}❌ Backend not reachable at {API_BASE}")
            print(f"   Start it with: cd Backend && python main.py{RESET}")
            return
        
        print(f"{GREEN}✅ Backend connected{RESET}\n")
        print(f"{BOLD}Starting {count} simulated transactions...{RESET}")
        print(f"{'='*60}")
        
        results = []
        total_amount = 0
        high_risk_count = 0
        
        for i in range(1, count + 1):
            # Build transaction
            amount = random.choice(SMURF_AMOUNTS[:count])
            recipient = random.choice(SUSPICIOUS_RECIPIENTS)
            platform = PLATFORMS[(i - 1) % len(PLATFORMS)] if cross_platform else "paytm"
            
            tx = {
                "recipient": recipient,
                "amount": amount,
                "platform": platform,
                "senderId": sender_id,
                "currency": "INR",
            }
            
            # Call SafeGuard check
            try:
                resp = await client.post(
                    f"{API_BASE}/safeguard/check",
                    json=tx,
                )
                result = resp.json()
                results.append(result)
                total_amount += amount
                
                if result.get("riskScore", 0) >= 0.5:
                    high_risk_count += 1
                
                print_transaction_result(i, count, tx, result)
                
            except Exception as e:
                print(f"{RED}❌ Transaction {i} failed: {e}{RESET}")
            
            # Dramatic pause
            if i < count:
                await asyncio.sleep(delay)
        
        # Summary
        print(f"\n{'='*60}")
        print(f"""
{BOLD}{PURPLE}╔══════════════════════════════════════════════════╗
║         ATTACK SIMULATION COMPLETE               ║
╚══════════════════════════════════════════════════╝{RESET}

{BOLD}Summary:{RESET}
   Transactions fired:    {count}
   Total amount:          ₹{total_amount:,.0f}
   High-risk detections:  {RED}{high_risk_count}{RESET} / {count}
   Platforms used:        {', '.join(set(PLATFORMS[:3]))}
   
{BOLD}What happened:{RESET}
   1. Each transaction was checked by SafeGuard in real-time
   2. High-risk transactions (score ≥ 0.5) triggered WebSocket alerts
   3. Dashboard Live Threat Map should now show {high_risk_count} new intercepts
   4. Velocity tracking detected rapid-fire structuring pattern
   
{YELLOW}{BOLD}👉 Check the Dashboard → Live Threat Map to see the alerts!{RESET}
""")
        
        # Get stats
        try:
            stats_resp = await client.get(f"{API_BASE}/safeguard/stats")
            stats = stats_resp.json()
            print(f"{BOLD}Global SafeGuard Stats:{RESET}")
            print(f"   Total checks:       {stats.get('totalChecks', 0)}")
            print(f"   Total flagged:      {stats.get('totalFlagged', 0)}")
            print(f"   Flagged recipients: {stats.get('flaggedRecipients', 0)}")
            print(f"   Flag rate:          {stats.get('flagRate', 0)*100:.1f}%")
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(
        description="SmurfPakad Demo Attack Simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python simulate_attack.py                  # Default demo
  python simulate_attack.py --demo           # Presentation mode
  python simulate_attack.py --fast           # Quick test
  python simulate_attack.py --count 20       # 20 transactions
        """,
    )
    
    parser.add_argument(
        "--count", "-n", type=int, default=10,
        help="Number of transactions to simulate (default: 10)"
    )
    parser.add_argument(
        "--fast", action="store_true",
        help="Fast mode (0.3s delay between transactions)"
    )
    parser.add_argument(
        "--demo", action="store_true",
        help="Demo mode (3s delay for dramatic presentation)"
    )
    parser.add_argument(
        "--delay", "-d", type=float, default=None,
        help="Custom delay between transactions in seconds"
    )
    parser.add_argument(
        "--sender", "-s", type=str, default="user_demo_primary",
        help="Sender ID for velocity tracking"
    )
    parser.add_argument(
        "--single-platform", action="store_true",
        help="Use only one platform (no cross-platform simulation)"
    )
    parser.add_argument(
        "--api-url", type=str, default=None,
        help="Override API base URL"
    )
    
    args = parser.parse_args()
    
    # Set delay
    if args.delay is not None:
        delay = args.delay
    elif args.fast:
        delay = 0.3
    elif args.demo:
        delay = 3.0
    else:
        delay = 1.5
    
    # Override API URL if specified
    global API_BASE
    if args.api_url:
        API_BASE = args.api_url.rstrip("/")
    
    print_banner()
    
    print(f"{BOLD}Configuration:{RESET}")
    print(f"   Transactions: {args.count}")
    print(f"   Delay:        {delay}s")
    print(f"   Mode:         {'demo' if args.demo else 'fast' if args.fast else 'standard'}")
    print(f"   Cross-platform: {'no' if args.single_platform else 'yes'}")
    print(f"   API:          {API_BASE}")
    print()
    
    asyncio.run(
        run_simulation(
            count=args.count,
            delay=delay,
            cross_platform=not args.single_platform,
            sender_id=args.sender,
        )
    )


if __name__ == "__main__":
    main()
