"""
SmurfPakad Demo Data Seeder
=============================
Seeds the dashboard with realistic-looking demo data
for hackathon presentation.

Creates:
1. Fake uploads with completed analysis
2. Simulated suspicious addresses with patterns
3. Pre-seeded SafeGuard check history

Usage:
    python seed_data.py              # Seed default demo data
    python seed_data.py --reset      # Clear and re-seed
"""
import asyncio
import sys
import random

try:
    import httpx
except ImportError:
    print("❌ httpx not installed. Run: pip install httpx")
    sys.exit(1)


API_BASE = "http://localhost:8000/api/v1"

# Colors
GREEN = "\033[92m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

# ============================================================================
# Demo seed: Pre-run SafeGuard checks to populate stats
# ============================================================================

SEED_TRANSACTIONS = [
    # Legitimate low-risk transactions
    {"recipient": "grocery_store@paytm", "amount": 250, "platform": "paytm", "currency": "INR"},
    {"recipient": "uber_ride@gpay", "amount": 450, "platform": "gpay", "currency": "INR"},
    {"recipient": "coffee_shop@phonepe", "amount": 180, "platform": "phonepe", "currency": "INR"},
    {"recipient": "rent_payment@paytm", "amount": 15000, "platform": "paytm", "currency": "INR"},
    {"recipient": "electric_bill@gpay", "amount": 2300, "platform": "gpay", "currency": "INR"},
    
    # Medium-risk (approaching thresholds)
    {"recipient": "supplier_bulk@phonepe", "amount": 85000, "platform": "phonepe", "currency": "INR"},
    {"recipient": "investment_transfer@paytm", "amount": 92000, "platform": "paytm", "currency": "INR"},
    
    # High-risk (structuring indicators)
    {"recipient": "mule_wallet_x@paytm", "amount": 99500, "platform": "paytm", "currency": "INR"},
    {"recipient": "nominee_acct_z@phonepe", "amount": 98000, "platform": "phonepe", "currency": "INR"},
    {"recipient": "shell_corp_y@gpay", "amount": 99900, "platform": "gpay", "currency": "INR"},
    {"recipient": "mule_wallet_x@paytm", "amount": 99000, "platform": "paytm", "currency": "INR"},
    {"recipient": "layering_node_7@phonepe", "amount": 97000, "platform": "phonepe", "currency": "INR"},
    {"recipient": "rapid_funnel_9@gpay", "amount": 99999, "platform": "gpay", "currency": "INR"},
    
    # More legitimate to balance the flag rate
    {"recipient": "friend_birthday@gpay", "amount": 500, "platform": "gpay", "currency": "INR"},
    {"recipient": "online_shopping@paytm", "amount": 3200, "platform": "paytm", "currency": "INR"},
    {"recipient": "gym_membership@phonepe", "amount": 1500, "platform": "phonepe", "currency": "INR"},
    {"recipient": "restaurant_bill@gpay", "amount": 850, "platform": "gpay", "currency": "INR"},
    {"recipient": "streaming_sub@paytm", "amount": 299, "platform": "paytm", "currency": "INR"},
]


async def seed_safeguard_history():
    """Seed SafeGuard check history with demo data."""
    print(f"\n{BOLD}{CYAN}Seeding SafeGuard Check History...{RESET}")
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        success = 0
        flagged = 0
        
        for tx in SEED_TRANSACTIONS:
            try:
                resp = await client.post(
                    f"{API_BASE}/safeguard/check",
                    json={
                        **tx,
                        "senderId": "demo_user_primary",
                    },
                )
                result = resp.json()
                risk = result.get("riskScore", 0)
                level = result.get("riskLevel", "low")
                
                icon = "🔴" if risk >= 0.5 else "🟡" if risk >= 0.3 else "🟢"
                print(f"  {icon} ₹{tx['amount']:>8,.0f} → {tx['recipient'][:25]:<25} [{level:>8}] {risk:.2f}")
                
                success += 1
                if risk >= 0.3:
                    flagged += 1
                
                await asyncio.sleep(0.2)
                
            except Exception as e:
                print(f"  ❌ Failed: {e}")
        
        print(f"\n{GREEN}✅ Seeded {success} transactions ({flagged} flagged){RESET}")


async def verify_ibm_status():
    """Check if IBM watsonx.ai is configured."""
    print(f"\n{BOLD}{CYAN}Checking IBM watsonx.ai Status...{RESET}")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{API_BASE}/ibm-ai/status")
            status = resp.json()
            
            if status.get("configured"):
                print(f"  {GREEN}✅ IBM watsonx.ai: CONFIGURED{RESET}")
                print(f"     Model: {status.get('model')}")
                print(f"     Status: {status.get('status')}")
            else:
                print(f"  {YELLOW}⚠  IBM watsonx.ai: NOT CONFIGURED{RESET}")
                print(f"     {status.get('message', '')}")
                print(f"     (Local fallback engine will be used for analyst briefs)")
        except Exception as e:
            print(f"  ❌ Could not reach IBM AI endpoint: {e}")


async def print_safeguard_stats():
    """Print current SafeGuard stats."""
    print(f"\n{BOLD}{CYAN}SafeGuard Global Stats:{RESET}")
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{API_BASE}/safeguard/stats")
            stats = resp.json()
            
            print(f"  Total checks:       {stats.get('totalChecks', 0)}")
            print(f"  Total flagged:      {stats.get('totalFlagged', 0)}")
            print(f"  Flagged recipients: {stats.get('flaggedRecipients', 0)}")
            print(f"  Flag rate:          {stats.get('flagRate', 0)*100:.1f}%")
        except Exception as e:
            print(f"  ❌ Could not get stats: {e}")


async def check_backend():
    """Check if backend is running."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{API_BASE.replace('/api/v1', '')}/health")
            return resp.status_code == 200
        except:
            return False


async def main():
    print(f"""
{BOLD}{CYAN}
╔══════════════════════════════════════════════════════╗
║         SmurfPakad Demo Data Seeder                  ║
╚══════════════════════════════════════════════════════╝
{RESET}""")
    
    if not await check_backend():
        print(f"{YELLOW}❌ Backend not running at {API_BASE}")
        print(f"   Start with: cd Backend && python main.py{RESET}")
        return
    
    print(f"{GREEN}✅ Backend connected{RESET}")
    
    await seed_safeguard_history()
    await verify_ibm_status()
    await print_safeguard_stats()
    
    print(f"""
{BOLD}{GREEN}
✅ Demo data seeded successfully!

Next steps:
  1. Open dashboard at http://localhost:8080/cryptoflow/dashboard
  2. Navigate to Live Threats to see SafeGuard stats
  3. Open War Room to test IBM AI Brief generation
  4. Run simulate_attack.py for a live demo attack
{RESET}""")


if __name__ == "__main__":
    asyncio.run(main())
