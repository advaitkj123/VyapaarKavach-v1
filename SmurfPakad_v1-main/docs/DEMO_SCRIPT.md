# SmurfPakad — 3-Minute Demo Video Script

## ⏱ Total Duration: 3:00

---

## SCENE 1: Hook (0:00 – 0:20)

**[Show stat on screen: "₹25,000 Crore laundered via UPI/crypto annually in India"]**

> "India's payment revolution has created a new problem: smurfs — networks of
> mule accounts that break large illegal payments into hundreds of small ones,
> across Paytm, PhonePe, GPay — staying invisible to every bank.
> Traditional rule engines miss 60% of these cross-platform patterns.
> We built SmurfPakad to stop them."

---

## SCENE 2: Live Upload → GNN Detection (0:20 – 1:00)

**[Switch to dashboard. Upload demo_data/upi_transactions_demo.csv]**

> "We drop in a real UPI transaction file. SmurfPakad's backend builds a
> transaction graph in real time — nodes are wallets, edges are transactions."

**[Watch graph build on screen — nodes appear one by one]**

> "Our GATv2 Graph Neural Network, trained on the Elliptic dataset plus our
> synthetic Indian UPI data, analyzes 166 graph features per wallet."

**[Risk scores appear on nodes — red = suspicious]**

> "In under 3 seconds, it's flagged 9 suspicious wallets with risk scores above 0.70.
> See that cluster — Fan-Out pattern, 5 mule accounts, converging on one collector."

---

## SCENE 3: War Room + IBM AI Agent (1:00 – 1:40)

**[Click on a red node. War Room opens. Click "Investigate with AI Agent"]**

> "Now watch IBM watsonx.ai take over. Our AML Investigation Agent
> runs 6 tools autonomously:"

**[Each step lights up in sequence]**

> "GNN Risk Scorer — 0.94 risk. Pattern Detector — Fan-Out confirmed.
> FATF Mapper — Indicators RF-1, RF-3 triggered. Transaction Context —
> ₹4.87 lakh moved in 72 hours across 15 counterparties. Cross-Platform
> Scanner — this money touched Paytm AND PhonePe. And finally, IBM
> Granite synthesizes all evidence into one report: RECOMMENDED ACTION: FILE SAR."

**[SAR report appears, IBM badge glows]**

> "All in 800 milliseconds. Zero manual investigation needed."

---

## SCENE 4: Federated Learning USP (1:40 – 2:15)

**[Switch to Federated ML page]**

> "Here's what no other AML system does: Federated Learning.
> Banks legally cannot share raw customer data. But smurfs exploit exactly
> that blind spot — moving money across banks that can't see each other's data."

**[Architecture diagram shows 3 banks → server]**

> "SmurfPakad solves this with Federated Averaging. Each bank — Paytm, PhonePe,
> GPay — trains locally on its own data. Only model gradients are shared.
> Zero raw transaction data ever leaves the institution."

**[Click 'Run Simulation' — convergence chart animates]**

> "The federated model achieves 96.2% accuracy — vs 89.4% for any single bank
> alone. That's the difference between catching a smurf and missing them."

**[Privacy summary card: '0 data points exposed']**

> "Zero data exposure. Full GDPR compliance. This is how you catch cross-bank
> money laundering without breaking privacy law."

---

## SCENE 5: SafeGuard Chrome Extension (2:15 – 2:40)

**[Open Chrome Extension on a payment page]**

> "And for end users — our SafeGuard Chrome Extension scores payment
> recipients in real-time before you send money."

**[Type in a suspicious UPI ID — red warning badge flashes]**

> "0.91 risk. Fan-Out pattern detected. SmurfPakad blocks this payment
> and alerts the user — protecting consumers before fraud happens."

---

## SCENE 6: Close (2:40 – 3:00)

**[Show architecture overview slide]**

> "SmurfPakad. GNN-powered detection. IBM watsonx.ai autonomous agents.
> Federated Learning across payment silos. FATF-compliant reporting.
> Consumer-facing real-time protection.
> This is what modern AML looks like."

**[IBM badge + team credits]**

---

## Recording Tips
- Record at 1080p, 60fps
- Use OBS Studio or Loom
- Narrate in confident, measured pace (not rushed)
- Zoom in on key numbers (risk scores, FATF flags)
- Add subtle background music (IBM-style corporate, low volume)
- Add captions for accessibility
