/**
 * SmurfPakad SafeGuard — Background Service Worker
 * ==================================================
 * Handles:
 * 1. API communication with SmurfPakad backend
 * 2. Risk score caching
 * 3. Notification management
 * 4. Extension state management
 */

const API_BASE = 'http://localhost:8000/api/v1';

// ============================================================================
// State Management
// ============================================================================

let safeguardEnabled = true;
let checkHistory = [];
let stats = {
  totalChecks: 0,
  blocked: 0,
  warnings: 0,
  safe: 0,
};

// Load saved state on startup
chrome.storage.local.get(['safeguardEnabled', 'checkHistory', 'stats'], (result) => {
  if (result.safeguardEnabled !== undefined) safeguardEnabled = result.safeguardEnabled;
  if (result.checkHistory) checkHistory = result.checkHistory;
  if (result.stats) stats = result.stats;
});

// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CHECK_TRANSACTION':
      handleTransactionCheck(message.data)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true; // Keep channel open for async response

    case 'GET_STATUS':
      sendResponse({
        enabled: safeguardEnabled,
        stats: stats,
        recentChecks: checkHistory.slice(-10),
      });
      return false;

    case 'TOGGLE_SAFEGUARD':
      safeguardEnabled = message.enabled;
      chrome.storage.local.set({ safeguardEnabled });
      sendResponse({ enabled: safeguardEnabled });
      return false;

    case 'GET_HISTORY':
      sendResponse({ history: checkHistory.slice(-50) });
      return false;

    case 'REPORT_SUSPICIOUS':
      handleReport(message.data)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// ============================================================================
// Transaction Risk Check
// ============================================================================

async function handleTransactionCheck(txData) {
  if (!safeguardEnabled) {
    return { riskLevel: 'disabled', score: 0, message: 'SafeGuard is disabled' };
  }

  const startTime = Date.now();

  try {
    // Call backend API for risk assessment
    const result = await checkWithBackend(txData);
    
    const checkRecord = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      recipient: txData.recipient || 'Unknown',
      amount: txData.amount || 0,
      platform: txData.platform || 'Unknown',
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      reasons: result.reasons || [],
      responseTime: Date.now() - startTime,
    };

    // Update history and stats
    checkHistory.push(checkRecord);
    if (checkHistory.length > 100) checkHistory = checkHistory.slice(-100);
    
    stats.totalChecks++;
    if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
      stats.blocked++;
    } else if (result.riskLevel === 'medium') {
      stats.warnings++;
    } else {
      stats.safe++;
    }

    // Persist state
    chrome.storage.local.set({ checkHistory, stats });

    // Send notification for high-risk
    if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '⚠️ SmurfPakad Security Alert',
        message: `High-risk payment detected! ${result.reasons[0] || 'Suspicious activity identified.'}`,
        priority: 2,
      });
    }

    return result;
  } catch (error) {
    // If backend is unavailable, use local heuristic checks
    console.warn('Backend unavailable, using local checks:', error.message);
    return localRiskCheck(txData);
  }
}

async function checkWithBackend(txData) {
  const response = await fetch(`${API_BASE}/safeguard/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: txData.recipient,
      amount: parseFloat(txData.amount) || 0,
      platform: txData.platform,
      senderHistory: txData.senderHistory || [],
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return await response.json();
}

// ============================================================================
// Local Heuristic Risk Check (Fallback)
// ============================================================================

function localRiskCheck(txData) {
  const amount = parseFloat(txData.amount) || 0;
  const reasons = [];
  let riskScore = 0;

  // Rule 1: Amount near CTR thresholds
  const thresholds = [10000, 50000, 100000, 200000, 500000, 1000000];
  for (const threshold of thresholds) {
    const ratio = amount / threshold;
    if (ratio >= 0.90 && ratio <= 1.0) {
      riskScore += 0.3;
      reasons.push(`Amount (₹${amount.toLocaleString()}) is ${(ratio * 100).toFixed(0)}% of ₹${threshold.toLocaleString()} threshold — possible structuring`);
      break;
    }
  }

  // Rule 2: Round amount detection
  if (amount > 1000 && amount % 1000 === 0) {
    riskScore += 0.1;
    reasons.push('Round amount detected — common in structured transactions');
  }

  // Rule 3: Recent rapid transactions (check history)
  const recentChecks = checkHistory.filter(c => {
    const timeDiff = Date.now() - new Date(c.timestamp).getTime();
    return timeDiff < 30 * 60 * 1000; // Last 30 minutes
  });

  if (recentChecks.length >= 3) {
    riskScore += 0.3;
    reasons.push(`${recentChecks.length} transactions in last 30 minutes — rapid-fire pattern detected`);
  }

  // Rule 4: High amount
  if (amount >= 50000) {
    riskScore += 0.15;
    reasons.push(`Large transaction amount: ₹${amount.toLocaleString()}`);
  }

  // Rule 5: New recipient (not in recent history)
  const knownRecipients = new Set(checkHistory.map(c => c.recipient));
  if (txData.recipient && !knownRecipients.has(txData.recipient)) {
    riskScore += 0.1;
    reasons.push('First-time payment to this recipient');
  }

  // Rule 6: Off-hours transaction
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 23) {
    riskScore += 0.1;
    reasons.push('Transaction initiated during off-hours (unusual timing)');
  }

  riskScore = Math.min(riskScore, 1.0);

  let riskLevel;
  if (riskScore >= 0.7) riskLevel = 'critical';
  else if (riskScore >= 0.5) riskLevel = 'high';
  else if (riskScore >= 0.3) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    riskScore,
    riskLevel,
    reasons,
    isLocalCheck: true,
    message: reasons.length > 0 
      ? `${reasons.length} risk indicator(s) detected` 
      : 'No risk indicators detected',
  };
}

// ============================================================================
// Report Handling
// ============================================================================

async function handleReport(reportData) {
  try {
    const response = await fetch(`${API_BASE}/safeguard/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData),
    });

    if (!response.ok) throw new Error(`Report failed: ${response.status}`);
    return { success: true, message: 'Report submitted successfully' };
  } catch {
    // Store locally if backend unavailable
    const reports = (await chrome.storage.local.get('pendingReports')).pendingReports || [];
    reports.push({ ...reportData, timestamp: new Date().toISOString() });
    await chrome.storage.local.set({ pendingReports: reports });
    return { success: true, message: 'Report saved locally (will sync when online)' };
  }
}

console.log('SmurfPakad SafeGuard background service worker initialized');
