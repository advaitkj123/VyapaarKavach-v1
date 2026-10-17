/**
 * SmurfPakad SafeGuard — Content Script
 * =======================================
 * Injected into payment pages (Paytm, GPay, PhonePe).
 * Detects payment forms, intercepts submissions, and shows risk warnings.
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__smurfpakad_injected) return;
  window.__smurfpakad_injected = true;

  console.log('[SmurfPakad] SafeGuard content script loaded on:', window.location.hostname);

  // ============================================================================
  // Platform Detection
  // ============================================================================

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('paytm')) return 'paytm';
    if (host.includes('google') && window.location.pathname.includes('pay')) return 'gpay';
    if (host.includes('phonepe')) return 'phonepe';
    return 'unknown';
  }

  const PLATFORM = detectPlatform();

  // Platform-specific selectors for payment elements
  const PLATFORM_SELECTORS = {
    paytm: {
      amountInputs: [
        'input[name="amount"]',
        'input[placeholder*="amount" i]',
        'input[placeholder*="Enter Amount" i]',
        'input[data-testid*="amount" i]',
        '.amount-input input',
        '#amount',
      ],
      recipientInputs: [
        'input[name="recipient"]',
        'input[placeholder*="UPI" i]',
        'input[placeholder*="mobile" i]',
        'input[placeholder*="name" i]',
        'input[data-testid*="recipient" i]',
        '.payee-input input',
      ],
      payButtons: [
        'button[data-testid*="pay" i]',
        'button:has-text("Pay")',
        '.pay-button',
        'button.primary-btn',
        'button[type="submit"]',
        '[class*="pay-btn"]',
        '[class*="PayButton"]',
      ],
    },
    gpay: {
      amountInputs: [
        'input[aria-label*="amount" i]',
        'input[name="amount"]',
        '#amount',
      ],
      recipientInputs: [
        'input[aria-label*="UPI" i]',
        'input[aria-label*="phone" i]',
      ],
      payButtons: [
        'button[aria-label*="pay" i]',
        'button[data-action*="pay" i]',
      ],
    },
    phonepe: {
      amountInputs: [
        'input[name="amount"]',
        'input[placeholder*="amount" i]',
        '#amount-input',
      ],
      recipientInputs: [
        'input[name="vpa"]',
        'input[placeholder*="UPI" i]',
      ],
      payButtons: [
        'button[class*="pay" i]',
        'button[data-testid*="pay" i]',
        '.pay-btn',
      ],
    },
    unknown: {
      amountInputs: [
        'input[name="amount"]',
        'input[placeholder*="amount" i]',
        'input[type="number"]',
      ],
      recipientInputs: [
        'input[name="recipient"]',
        'input[placeholder*="UPI" i]',
        'input[placeholder*="account" i]',
      ],
      payButtons: [
        'button[type="submit"]',
        'input[type="submit"]',
      ],
    },
  };

  // ============================================================================
  // DOM Scanning & Payment Detection
  // ============================================================================

  function findElement(selectors) {
    for (const selector of selectors) {
      try {
        // Handle :has-text pseudo selector
        if (selector.includes(':has-text(')) {
          const match = selector.match(/(.*):has-text\("(.*)"\)/);
          if (match) {
            const elements = document.querySelectorAll(match[1]);
            for (const el of elements) {
              if (el.textContent.trim().toLowerCase().includes(match[2].toLowerCase())) {
                return el;
              }
            }
          }
          continue;
        }
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return null;
  }

  function findAllElements(selectors) {
    const found = [];
    for (const selector of selectors) {
      try {
        if (selector.includes(':has-text(')) continue;
        document.querySelectorAll(selector).forEach(el => {
          if (!found.includes(el)) found.push(el);
        });
      } catch (e) {
        // Skip invalid selectors
      }
    }
    return found;
  }

  function extractPaymentInfo() {
    const config = PLATFORM_SELECTORS[PLATFORM] || PLATFORM_SELECTORS.unknown;
    
    const amountEl = findElement(config.amountInputs);
    const recipientEl = findElement(config.recipientInputs);
    
    let amount = 0;
    if (amountEl) {
      const val = amountEl.value || amountEl.textContent || '';
      amount = parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
    }
    
    let recipient = '';
    if (recipientEl) {
      recipient = recipientEl.value || recipientEl.textContent || '';
    }
    
    return { amount, recipient, platform: PLATFORM };
  }

  // ============================================================================
  // Warning Overlay
  // ============================================================================

  function createWarningOverlay(riskResult, paymentInfo) {
    // Remove existing overlay if any
    const existing = document.getElementById('smurfpakad-warning-overlay');
    if (existing) existing.remove();

    const riskPercent = Math.round(riskResult.riskScore * 100);
    const isHighRisk = riskResult.riskLevel === 'critical' || riskResult.riskLevel === 'high';
    const isMediumRisk = riskResult.riskLevel === 'medium';

    let statusColor, statusIcon, statusText, statusBg;
    if (isHighRisk) {
      statusColor = '#ff4444';
      statusIcon = '🔴';
      statusText = 'HIGH RISK — POTENTIAL FRAUD';
      statusBg = 'linear-gradient(135deg, #1a0000 0%, #2d0a0a 100%)';
    } else if (isMediumRisk) {
      statusColor = '#ffaa00';
      statusIcon = '⚠️';
      statusText = 'SUSPICIOUS — PROCEED WITH CAUTION';
      statusBg = 'linear-gradient(135deg, #1a1500 0%, #2d2200 100%)';
    } else {
      statusColor = '#44cc44';
      statusIcon = '✅';
      statusText = 'LOW RISK — APPEARS SAFE';
      statusBg = 'linear-gradient(135deg, #001a00 0%, #0a2d0a 100%)';
    }

    const overlay = document.createElement('div');
    overlay.id = 'smurfpakad-warning-overlay';
    overlay.innerHTML = `
      <div class="sp-overlay-backdrop">
        <div class="sp-warning-card" style="border-color: ${statusColor}">
          <div class="sp-header">
            <div class="sp-logo">
              <span class="sp-shield">🛡️</span>
              <span class="sp-brand">SmurfPakad SafeGuard</span>
            </div>
            <button class="sp-close-btn" id="sp-close-overlay">✕</button>
          </div>
          
          <div class="sp-status-bar" style="background: ${statusBg}; border-left: 4px solid ${statusColor}">
            <span class="sp-status-icon">${statusIcon}</span>
            <span class="sp-status-text" style="color: ${statusColor}">${statusText}</span>
          </div>
          
          <div class="sp-risk-meter">
            <div class="sp-risk-label">Risk Score</div>
            <div class="sp-risk-bar-container">
              <div class="sp-risk-bar-fill" style="width: ${riskPercent}%; background: ${statusColor}"></div>
            </div>
            <div class="sp-risk-value" style="color: ${statusColor}">${riskPercent}/100</div>
          </div>

          <div class="sp-payment-info">
            <div class="sp-info-row">
              <span class="sp-info-label">Recipient:</span>
              <span class="sp-info-value">${paymentInfo.recipient || 'Unknown'}</span>
            </div>
            <div class="sp-info-row">
              <span class="sp-info-label">Amount:</span>
              <span class="sp-info-value">₹${paymentInfo.amount.toLocaleString()}</span>
            </div>
            <div class="sp-info-row">
              <span class="sp-info-label">Platform:</span>
              <span class="sp-info-value">${paymentInfo.platform.toUpperCase()}</span>
            </div>
          </div>

          ${riskResult.reasons && riskResult.reasons.length > 0 ? `
            <div class="sp-reasons">
              <div class="sp-reasons-title">🔍 Detection Details</div>
              <ul class="sp-reasons-list">
                ${riskResult.reasons.map(r => `<li>${r}</li>`).join('')}
              </ul>
            </div>
          ` : ''}

          <div class="sp-actions">
            ${isHighRisk ? `
              <button class="sp-btn sp-btn-danger" id="sp-cancel-payment">
                ✋ Cancel & Report
              </button>
              <button class="sp-btn sp-btn-secondary" id="sp-proceed-anyway">
                Proceed Anyway (Not Recommended)
              </button>
            ` : isMediumRisk ? `
              <button class="sp-btn sp-btn-warning" id="sp-proceed-cautious">
                ⚠️ Proceed with Caution
              </button>
              <button class="sp-btn sp-btn-secondary" id="sp-cancel-payment">
                Cancel Payment
              </button>
            ` : `
              <button class="sp-btn sp-btn-safe" id="sp-proceed-safe">
                ✅ Continue Payment
              </button>
            `}
          </div>

          <div class="sp-footer">
            <span class="sp-powered">Powered by SmurfPakad AI • GATv2 Graph Neural Network</span>
            ${riskResult.isLocalCheck ? '<span class="sp-local-badge">⚡ Local Analysis</span>' : '<span class="sp-cloud-badge">☁️ Cloud AI</span>'}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners
    const closeBtn = document.getElementById('sp-close-overlay');
    const cancelBtn = document.getElementById('sp-cancel-payment');
    const proceedBtn = document.getElementById('sp-proceed-anyway') 
                    || document.getElementById('sp-proceed-cautious')
                    || document.getElementById('sp-proceed-safe');

    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Report the transaction
        chrome.runtime.sendMessage({
          type: 'REPORT_SUSPICIOUS',
          data: {
            ...paymentInfo,
            riskScore: riskResult.riskScore,
            reasons: riskResult.reasons,
            action: 'cancelled',
          },
        });
        overlay.remove();
        // Try to prevent the payment
        showCancelledNotice();
      });
    }

    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        overlay.remove();
      });
    }

    // Auto-close after 30 seconds for low-risk
    if (!isHighRisk && !isMediumRisk) {
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 5000);
    }
  }

  function showCancelledNotice() {
    const notice = document.createElement('div');
    notice.id = 'smurfpakad-cancelled-notice';
    notice.innerHTML = `
      <div class="sp-notice">
        🛡️ Payment cancelled by SmurfPakad SafeGuard. 
        A report has been filed for investigation.
      </div>
    `;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 5000);
  }

  // ============================================================================
  // Small SafeGuard Badge (Always Visible)
  // ============================================================================

  function createSafeguardBadge() {
    const badge = document.createElement('div');
    badge.id = 'smurfpakad-badge';
    badge.innerHTML = `
      <div class="sp-badge" title="SmurfPakad SafeGuard is active">
        <span class="sp-badge-icon">🛡️</span>
        <span class="sp-badge-text">SafeGuard Active</span>
      </div>
    `;
    document.body.appendChild(badge);
  }

  // ============================================================================
  // Payment Interception
  // ============================================================================

  let isChecking = false;

  async function interceptPayment(event) {
    if (isChecking) return;
    isChecking = true;

    const paymentInfo = extractPaymentInfo();
    
    // Only check if there's meaningful data
    if (paymentInfo.amount <= 0 && !paymentInfo.recipient) {
      isChecking = false;
      return;
    }

    // Prevent the original payment action temporarily
    event.preventDefault();
    event.stopPropagation();

    console.log('[SmurfPakad] Checking transaction:', paymentInfo);

    try {
      // Send to background worker for risk check
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: 'CHECK_TRANSACTION', data: paymentInfo },
          (response) => {
            resolve(response || { riskScore: 0, riskLevel: 'low', reasons: [] });
          }
        );
      });

      console.log('[SmurfPakad] Risk result:', result);

      // Show warning overlay
      createWarningOverlay(result, paymentInfo);

    } catch (error) {
      console.error('[SmurfPakad] Check failed:', error);
    } finally {
      isChecking = false;
    }
  }

  // ============================================================================
  // DOM Monitoring & Setup
  // ============================================================================

  function attachPayButtonListeners() {
    const config = PLATFORM_SELECTORS[PLATFORM] || PLATFORM_SELECTORS.unknown;
    const payButtons = findAllElements(config.payButtons);

    payButtons.forEach(btn => {
      if (btn.__smurfpakad_listener) return;
      btn.__smurfpakad_listener = true;
      
      btn.addEventListener('click', interceptPayment, true);
      console.log('[SmurfPakad] Attached listener to pay button:', btn.textContent?.trim());
    });

    // Also listen for form submissions
    document.querySelectorAll('form').forEach(form => {
      if (form.__smurfpakad_listener) return;
      form.__smurfpakad_listener = true;
      
      form.addEventListener('submit', (e) => {
        const paymentInfo = extractPaymentInfo();
        if (paymentInfo.amount > 0) {
          interceptPayment(e);
        }
      }, true);
    });
  }

  // Watch for dynamically added payment forms (SPAs)
  const observer = new MutationObserver(() => {
    attachPayButtonListeners();
  });

  // ============================================================================
  // Initialization
  // ============================================================================

  function init() {
    console.log(`[SmurfPakad] SafeGuard initialized for ${PLATFORM}`);
    
    createSafeguardBadge();
    attachPayButtonListeners();

    // Start DOM observer for dynamic content (SPA navigation)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Re-scan periodically (fallback for tricky SPAs)
    setInterval(attachPayButtonListeners, 3000);
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
