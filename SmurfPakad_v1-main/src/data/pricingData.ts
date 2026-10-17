// pricingPlansData.ts

export const pricingPlans = [
  {
    name: "Analyst",
    price: { monthly: "$299", annual: "$249" },
    description: "Perfect for compliance officers and blockchain analysts.",
    features: [
      "Up to 100K transactions/month",
      "Basic graph visualization",
      "Suspicion score reports",
      "Email support",
      "Standard pattern detection",
      "CSV export"
    ],
    buttonText: "Get Started"
  },
  {
    name: "Professional",
    price: { monthly: "$799", annual: "$649" },
    description: "For financial institutions and RegTech companies.",
    features: [
      "Up to 1M transactions/month",
      "Advanced graph visualization",
      "Real-time pattern detection",
      "Priority support",
      "Custom illicit wallet lists",
      "API access",
      "Detailed forensic reports",
      "Peeling chain detection"
    ],
    highlighted: true,
    buttonText: "Start Free Trial"
  },
  {
    name: "Enterprise",
    price: { monthly: "$2,499", annual: "$1,999" },
    description: "Comprehensive solution for regulatory bodies.",
    features: [
      "Unlimited transaction analysis",
      "Custom GNN model training",
      "Real-time monitoring",
      "24/7 dedicated support",
      "White-label solutions",
      "Advanced API access",
      "Multi-blockchain support",
      "Custom reporting dashboards",
      "On-premise deployment option"
    ],
    buttonText: "Contact Sales"
  }
];
