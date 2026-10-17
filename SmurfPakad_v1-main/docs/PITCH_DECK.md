# SmurfPakad — 10-Slide Pitch Deck Outline
## IBM International Financial Hackathon

---

### SLIDE 1 — Title
**SmurfPakad**
*AI-Powered AML Detection & Prevention for India's UPI Ecosystem*

- One-liner: "We catch money laundering that hides across payment apps"
- Team name + IBM hackathon branding
- IBM watsonx.ai badge (prominent)

**Visual**: Animated graph network with red nodes lighting up

---

### SLIDE 2 — The Problem
**₹25,000 Crore. Laundered. Every Year. Via UPI.**

- India processed ₹240 trillion in UPI transactions in 2024
- "Smurfs" exploit the ₹1 lakh CTR threshold — splitting payments to stay invisible
- **The critical gap**: Each payment app (Paytm, PhonePe, GPay) sees its own silo
  — cross-platform laundering is invisible to ALL of them
- Current rule engines miss 60%+ of cross-platform patterns

**Visual**: Diagram of money flowing from one platform to another, undetected

---

### SLIDE 3 — Our Solution
**SmurfPakad: Graph AI + Federated Intelligence**

Three layers of defense:
1. **Detection**: GATv2 Graph Neural Network (98.5% accuracy) on transaction graphs
2. **Investigation**: IBM watsonx.ai Autonomous Agent (6-tool pipeline, <1s)  
3. **Prevention**: SafeGuard Chrome Extension (real-time consumer protection)

**Visual**: Clean 3-tier architecture diagram

---

### SLIDE 4 — IBM Technology (Deep Integration)

| IBM Service | How We Use It | Why It's Core |
|-------------|--------------|---------------|
| **watsonx.ai Granite** | Autonomous AML Investigation Agent | Remove it → no automated reports |
| **watsonx.governance** | AI fairness, bias detection, drift monitoring | Regulatory compliance |
| **IBM Code Engine** | Production deployment | Live scalable API |
| **IBM Cloud IAM** | Secure token-based API authentication | Security layer |

**Visual**: IBM badge with 4 service logos, each with a connecting arrow to system component

---

### SLIDE 5 — Live Demo Screenshots

Row 1:
- Transaction graph (red suspicious nodes)
- War Room with alert cards

Row 2:
- IBM Agent chat (6 steps lighting up, SAR recommendation)
- SafeGuard extension blocking a payment

**Visual**: 4-panel screenshot collage, annotated

---

### SLIDE 6 — The USP: Federated Learning
**How We Broke the Privacy-Detection Tradeoff**

- **Problem**: Banks legally can't share customer data (GDPR, PCI-DSS)
- **Traditional approach**: Each bank detects independently → misses cross-bank smurfing
- **SmurfPakad**: FedAvg algorithm — local training, gradient sharing only

```
Bank A (Paytm)   → local training → gradient ─┐
Bank B (PhonePe) → local training → gradient ──► FedAvg → Global Model
Bank C (GPay)    → local training → gradient ─┘
Zero raw data ever shared. 0 records exposed.
```

- **Result**: +6.8% accuracy improvement vs isolated training
- **Privacy**: (ε=1.0, δ=1e-5)-Differential Privacy on gradients
- **Compliance**: GDPR Article 5(1)(c), RBI IT Framework compliant

**Visual**: Architecture flow + accuracy comparison bar chart

---

### SLIDE 7 — Model Performance

| Metric | SmurfPakad | Industry Baseline |
|--------|-----------|-------------------|
| **Accuracy** | 98.5% | ~87% |
| **F1 Score (Fraud)** | 0.947 | ~0.73 |
| **False Positive Rate** | 1.2% | ~8.4% |
| **Detection Speed** | < 3 seconds | Hours / Days |
| **Cross-Platform** | ✅ Yes | ❌ No |
| **Explainable** | ✅ XAI + FATF | ❌ Black box |

**Visual**: ROC curve comparison + confusion matrix heatmap

---

### SLIDE 8 — Responsible AI / Governance

- **Fairness**: Tested across wallet categories — Grade B+ (87.3/100 fairness score)
- **Bias Alerts**: Automated detection of demographic parity violations
- **Drift Monitoring**: 7-day rolling prediction distribution tracking
- **Audit Trail**: Every prediction logged with timestamp + model version
- **Certifications**: FATF AML/CFT compliant, IBM watsonx.governance aligned

**Visual**: AI Governance dashboard screenshot with fairness grade

---

### SLIDE 9 — Business Model / Go-to-Market

**Who pays for SmurfPakad?**

- **B2B SaaS**: License to banks, NBFCs, payment aggregators (₹10-50L/year)
- **API-as-a-Service**: Per-transaction risk scoring (₹0.001/transaction)
- **Regulatory Compliance Package**: SAR filing automation for RBI reporting

**Market Size**:
- India: 300+ scheduled banks, 200+ payment apps = ₹800Cr TAM
- Global expansion: FATF member countries = $12B TAM

**Traction Path**: Pilot with cooperative banks (accessible) → NPCI partnership

---

### SLIDE 10 — Team & Close

**Team SmurfPakad**
- [Teammate 1] — ML Engineering (GNN/GATv2, Ensemble)
- [Teammate 2] — Full Stack + IBM Integration

**What We Built in [X] Days**:
- 1 Graph Neural Network (98.5% accuracy)
- 1 IBM watsonx.ai Autonomous Agent
- 1 Federated Learning system (3 banks)
- 1 Chrome Extension (SafeGuard)
- 1 Compliance dashboard (SAR + FATF)

**SmurfPakad — Because every smurf leaves a trace in the graph.**

*Powered by IBM watsonx.ai* 🔵

---

## Slide Design Notes
- **Color palette**: Dark navy (#0a0b10) background, IBM blue (#054ADA) accents
- **Font**: Inter (headings), JetBrains Mono (code/numbers)
- **Transitions**: Subtle fade — no cheesy animations
- **Logo**: SmurfPakad logo top-left, IBM badge top-right on every slide
- **Slide size**: 16:9 widescreen
