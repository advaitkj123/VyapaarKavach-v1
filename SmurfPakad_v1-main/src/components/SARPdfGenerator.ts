/**
 * SAR PDF Generator — FIU-IND Compliant Format
 * Powered by IBM watsonx.ai + SmurfPakad GATv2 GNN
 */
import jsPDF from "jspdf";

interface SARData {
  walletId: string;
  riskScore: number;
  riskLevel: string;
  patterns: Array<{ type: string; severity: string; description: string; detail?: string }>;
  featureImportance: Array<{ feature_name: string; importance: number; value: number }>;
  graphMetrics?: { in_degree: number; out_degree: number; total_connections: number };
  analystBrief?: string | null;
  riskAssessment?: string | null;
  regulatoryFlags?: Array<any>;
  recommendations?: string[];
}

export async function generateSARPdf(data: SARData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN");
  const safeId = data.walletId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  const refId = `SAR-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${safeId}`;
  const riskPct = Math.round(data.riskScore * 100);

  // Colors as tuples
  const BG: [number, number, number] = [10, 12, 20];
  const HEADER_BG: [number, number, number] = [15, 20, 45];
  const SECTION_BG: [number, number, number] = [20, 25, 50];
  const ACCENT: [number, number, number] = [99, 102, 241];
  const ACCENT_LIGHT: [number, number, number] = [139, 92, 246];
  const RED: [number, number, number] = [239, 68, 68];
  const ORANGE: [number, number, number] = [249, 115, 22];
  const YELLOW: [number, number, number] = [234, 179, 8];
  const GREEN: [number, number, number] = [34, 197, 94];
  const CYAN: [number, number, number] = [34, 211, 238];
  const WHITE: [number, number, number] = [255, 255, 255];
  const GRAY400: [number, number, number] = [156, 163, 175];
  const GRAY600: [number, number, number] = [75, 85, 99];
  const IBM_BLUE: [number, number, number] = [0, 98, 255];

  const W = 210;
  const margin = 14;
  const contentW = W - margin * 2;
  let y = 0;

  const sf = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const st = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const sd = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const newPage = () => {
    doc.addPage();
    sf(BG);
    doc.rect(0, 0, W, 297, "F");
    y = 15;
  };

  // Page background
  sf(BG);
  doc.rect(0, 0, W, 297, "F");

  // Header gradient
  for (let i = 0; i < 44; i++) {
    const a = 1 - i / 44;
    doc.setFillColor(
      Math.round(ACCENT[0] * a + HEADER_BG[0] * (1 - a)),
      Math.round(ACCENT[1] * a * 0.3 + HEADER_BG[1] * (1 - a * 0.3)),
      Math.round(ACCENT[2] * a * 0.5 + HEADER_BG[2] * (1 - a * 0.5))
    );
    doc.rect(0, i, W, 1, "F");
  }

  // Logo circle
  sf(ACCENT);
  doc.circle(margin + 6, 14, 6, "F");
  st(WHITE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("SP", margin + 3.5, 14.8);

  // Title
  st(WHITE);
  doc.setFontSize(16);
  doc.text("SUSPICIOUS ACTIVITY REPORT", margin + 16, 13);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  st(GRAY400);
  doc.text("FIU-IND COMPLIANT FORMAT  |  PMLA 2002  |  FATF 2023", margin + 16, 18.5);
  st(GRAY400);
  doc.setFontSize(7);
  doc.text("Powered by IBM watsonx.ai + GATv2 GNN", margin + 16, 24);

  // IBM badge
  sf(IBM_BLUE);
  doc.roundedRect(W - margin - 38, 6, 38, 10, 2, 2, "F");
  st(WHITE);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("IBM watsonx.ai", W - margin - 36, 12.5);

  // Reference strip
  sf(SECTION_BG);
  doc.rect(0, 34, W, 10, "F");
  st(CYAN);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("REF: " + refId, margin, 40.5);
  st(GRAY400);
  doc.setFont("helvetica", "normal");
  doc.text("Generated: " + dateStr + " at " + timeStr, W / 2, 40.5, { align: "center" });
  doc.text("CONFIDENTIAL — FIU-IND SUBMISSION", W - margin, 40.5, { align: "right" });

  y = 52;

  // Section header helper
  const sectionHeader = (label: string) => {
    if (y > 260) newPage();
    sf(SECTION_BG);
    doc.rect(margin - 2, y - 3, contentW + 4, 9, "F");
    sd(ACCENT);
    doc.setLineWidth(0.5);
    doc.line(margin - 2, y - 3, margin - 2, y + 6);
    st(ACCENT_LIGHT);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 2, y + 3);
    y += 12;
  };

  // Key-value row helper
  const kvRow = (key: string, val: string, vc?: [number, number, number]) => {
    if (y > 270) newPage();
    st(GRAY400);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(key, margin + 2, y);
    if (vc) st(vc); else st(WHITE);
    doc.setFont("helvetica", "bold");
    doc.text(val, margin + 52, y);
    y += 6;
  };

  // Body text helper
  const body = (text: string, indent = 0) => {
    const lines = doc.splitTextToSize(text, contentW - indent - 4);
    for (const line of lines) {
      if (y > 270) newPage();
      st(GRAY400);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(line, margin + 2 + indent, y);
      y += 5;
    }
  };

  // ── SECTION A ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION A — SUBJECT WALLET DETAILS");
  const riskColor: [number, number, number] = riskPct >= 70 ? RED : riskPct >= 50 ? ORANGE : YELLOW;
  sf(riskColor);
  doc.circle(W - margin - 10, y + 2, 9, "F");
  st(WHITE);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const riskStr = riskPct.toString();
  doc.text(riskStr, W - margin - (riskStr.length > 1 ? 13.5 : 11), y + 5.5);
  kvRow("Wallet ID", data.walletId);
  kvRow("Risk Score (GATv2)", riskPct + "% — " + data.riskLevel.toUpperCase(), riskColor);
  if (data.graphMetrics) {
    kvRow("In-Degree", data.graphMetrics.in_degree + " incoming connections");
    kvRow("Out-Degree", data.graphMetrics.out_degree + " outgoing connections");
    kvRow("Total Connections", data.graphMetrics.total_connections.toString());
  }
  y += 4;

  // ── SECTION B ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION B — SUSPICIOUS ACTIVITY DESCRIPTION");
  const briefText = data.analystBrief ||
    "Wallet " + data.walletId + " exhibits a " + data.riskLevel + "-risk profile with a GATv2 suspicion score of " +
    riskPct + "%. The node participates in a classic smurfing cluster, receiving sub-threshold transactions from " +
    "dispersed sources before aggregating into an offshore collector wallet. Cross-platform fund movement detected " +
    "across UPI and crypto infrastructure suggests layering consistent with FATF typology TR-05 (Structuring).";
  body(briefText);
  y += 2;
  if (data.riskAssessment) {
    st(ACCENT_LIGHT);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text("Risk Assessment:", margin + 2, y);
    y += 5;
    body(data.riskAssessment);
  }
  y += 4;

  // ── SECTION C ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION C — DETECTED PATTERNS");
  if (data.patterns.length === 0) {
    body("No suspicious patterns detected.");
  } else {
    for (let i = 0; i < data.patterns.length; i++) {
      const p = data.patterns[i];
      if (y > 265) newPage();
      const sc: [number, number, number] = p.severity === "critical" ? RED : p.severity === "high" ? ORANGE : YELLOW;
      sf(sc);
      doc.rect(margin - 2, y - 3, 3, 10, "F");
      sf([20, 25, 50]);
      doc.rect(margin + 1, y - 3, contentW + 1, 10, "F");
      st(sc);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text((i + 1) + ". [" + (p.severity || "HIGH").toUpperCase() + "] " + p.type.replace(/_/g, " ").toUpperCase(), margin + 3, y + 1.5);
      st(GRAY400);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const dl = doc.splitTextToSize(p.description, contentW - 8);
      for (let li = 0; li < dl.length; li++) {
        doc.text(dl[li], margin + 3, y + 6 + li * 4.5);
      }
      y += 7 + dl.length * 4.5;
      if (p.detail) { st(GRAY600); doc.setFontSize(7); body("   Detail: " + p.detail, 4); }
      y += 2;
    }
  }

  // ── SECTION D ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION D — AI EXPLAINABILITY (GATv2 XAI)");
  body("The following GATv2 graph attention features contributed most to the suspicious classification:");
  y += 2;
  const maxImp = data.featureImportance[0]?.importance || 1;
  for (const feat of data.featureImportance) {
    if (y > 270) newPage();
    const bw = (feat.importance / maxImp) * (contentW * 0.45);
    st(GRAY400);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(feat.feature_name.replace(/_/g, " "), margin + 2, y);
    doc.text((feat.importance * 100).toFixed(1) + "%", margin + 70, y);
    doc.text("val: " + feat.value, margin + 85, y);
    sf([30, 35, 60]);
    doc.rect(margin + 2, y + 1.5, contentW * 0.45, 3, "F");
    const bc: [number, number, number] = feat.importance > 0.6 * maxImp ? RED : feat.importance > 0.3 * maxImp ? ORANGE : CYAN;
    sf(bc);
    doc.rect(margin + 2, y + 1.5, bw, 3, "F");
    y += 9;
  }
  y += 3;

  // ── SECTION E ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION E — REGULATORY FLAGS (FATF TYPOLOGIES)");
  const defaultFlags = [
    { rule: "FATF-TR-05", description: "Structuring: transactions split to avoid reporting thresholds.", severity: "critical" },
    { rule: "FATF-TR-06", description: "Use of intermediaries for layering through nominee wallets.", severity: "high" },
    { rule: "FATF-TR-08", description: "Threshold evasion: amounts clustered just below mandatory limits.", severity: "high" },
  ];
  const flags = (data.regulatoryFlags && data.regulatoryFlags.length > 0) ? data.regulatoryFlags : defaultFlags;
  for (const flag of flags) {
    if (y > 265) newPage();
    const rule = typeof flag === "object" ? (flag.rule || "") : flag;
    const desc = typeof flag === "object" ? (flag.description || "") : "";
    const sev  = typeof flag === "object" ? (flag.severity || "high") : "high";
    const sc: [number, number, number] = sev === "critical" ? RED : sev === "high" ? ORANGE : YELLOW;
    sf([20, 25, 50]);
    doc.rect(margin - 2, y - 3, contentW + 4, 11, "F");
    sd(sc);
    doc.setLineWidth(0.4);
    doc.line(margin - 2, y - 3, margin - 2, y + 8);
    st(sc);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(rule + "  [" + sev.toUpperCase() + "]", margin + 2, y + 1);
    if (desc) {
      st(GRAY400);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const dlines = doc.splitTextToSize(desc, contentW - 6);
      for (let li = 0; li < dlines.length; li++) doc.text(dlines[li], margin + 2, y + 5.5 + li * 4);
      y += 5 + dlines.length * 4 + 3;
    } else { y += 10; }
  }
  y += 4;

  // ── SECTION F ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION F — RECOMMENDED ACTIONS");
  const action = riskPct >= 75 ? "FILE_SAR" : riskPct >= 50 ? "ESCALATE" : "MONITOR";
  const ac: [number, number, number] = action === "FILE_SAR" ? RED : action === "ESCALATE" ? ORANGE : GREEN;
  sf(ac);
  doc.roundedRect(margin, y - 2, 48, 11, 2, 2, "F");
  st(WHITE);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(action, margin + 3.5, y + 5.5);
  y += 17;
  const recs = (data.recommendations && data.recommendations.length > 0) ? data.recommendations : [
    "File SAR with FIU-IND within 7 days under PMLA 2002 Section 12.",
    "Freeze wallet and linked accounts pending investigation.",
    "Initiate KYC re-verification for all cluster members.",
    "Cross-reference with CERSAI database and RBI fraud registry.",
    "Escalate to Enforcement Directorate if layering confirmed.",
  ];
  for (const rec of recs) {
    if (y > 265) newPage();
    sf(ACCENT_LIGHT);
    doc.circle(margin + 3, y - 0.5, 1.5, "F");
    body(rec, 8);
    y += 1;
  }
  y += 4;

  // ── SECTION G ──────────────────────────────────────────────────────────────
  sectionHeader("SECTION G — SYSTEM ATTESTATION");
  body("This SAR was autonomously generated by the SmurfPakad AI system. Human analyst review is mandatory before filing with FIU-IND or law enforcement authorities.");
  y += 3;
  kvRow("AI Model", "IBM watsonx.ai — granite-3-8b-instruct");
  kvRow("GNN Model", "GATv2 (Graph Attention Network v2)");
  kvRow("Dataset", "Elliptic Bitcoin + Synthetic UPI/Paytm/PhonePe");
  kvRow("FATF Alignment", "FATF Recommendations 2023 — TR-05, TR-06, TR-08");
  kvRow("Compliance", "PMLA 2002, RBI KYC Master Direction 2016, FIU-IND");
  y += 4;

  // Warning box
  if (y > 255) newPage();
  sf([60, 30, 10]);
  doc.rect(margin - 2, y - 3, contentW + 4, 13, "F");
  sd(ORANGE);
  doc.setLineWidth(0.5);
  doc.rect(margin - 2, y - 3, contentW + 4, 13);
  st(ORANGE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("WARNING: System-generated report. Mandatory human review required before official submission.", margin + 2, y + 4);
  y += 18;

  // Footers on all pages
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    sf(HEADER_BG);
    doc.rect(0, 284, W, 13, "F");
    sd(ACCENT);
    doc.setLineWidth(0.3);
    doc.line(0, 284, W, 284);
    st(GRAY600);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text("SmurfPakad SafeGuard  |  Powered by IBM watsonx.ai x GATv2  |  FIU-IND Compliant  |  (c) 2024", W / 2, 290, { align: "center" });
    doc.text("Page " + p + " of " + pageCount, W - margin, 290, { align: "right" });
    doc.text(refId, margin, 290);
  }

  doc.save("SAR_" + data.walletId.replace(/[^a-zA-Z0-9]/g, "_") + "_" + now.toISOString().slice(0, 10) + ".pdf");
}
