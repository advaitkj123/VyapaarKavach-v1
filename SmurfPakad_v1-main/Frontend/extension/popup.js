/**
 * SmurfPakad SafeGuard — Extension Popup Script
 * Loads stats and recent activity from background worker.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Load current status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (!response) return;

    // Update toggle
    const toggle = document.getElementById('toggle-safeguard');
    toggle.checked = response.enabled;

    // Update stats
    document.getElementById('stat-total').textContent = response.stats.totalChecks;
    document.getElementById('stat-safe').textContent = response.stats.safe;
    document.getElementById('stat-warnings').textContent = response.stats.warnings;
    document.getElementById('stat-blocked').textContent = response.stats.blocked;

    // Update activity list
    const activityList = document.getElementById('activity-list');
    const emptyState = document.getElementById('empty-state');

    if (response.recentChecks && response.recentChecks.length > 0) {
      emptyState.style.display = 'none';
      
      // Show most recent first
      const checks = [...response.recentChecks].reverse();
      
      checks.forEach(check => {
        const item = document.createElement('div');
        item.className = `activity-item risk-${check.riskLevel}`;

        const icon = check.riskLevel === 'critical' || check.riskLevel === 'high' 
          ? '🔴' 
          : check.riskLevel === 'medium' ? '⚠️' : '✅';

        const scoreClass = check.riskLevel === 'critical' || check.riskLevel === 'high'
          ? 'score-high'
          : check.riskLevel === 'medium' ? 'score-medium' : 'score-low';

        const time = new Date(check.timestamp);
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
          <span class="activity-icon">${icon}</span>
          <div class="activity-info">
            <div class="activity-recipient">${check.recipient || 'Unknown'}</div>
            <div class="activity-meta">₹${(check.amount || 0).toLocaleString()} • ${check.platform} • ${timeStr}</div>
          </div>
          <span class="activity-score ${scoreClass}">${Math.round(check.riskScore * 100)}%</span>
        `;

        activityList.appendChild(item);
      });
    }
  });

  // Toggle handler
  document.getElementById('toggle-safeguard').addEventListener('change', (e) => {
    chrome.runtime.sendMessage({
      type: 'TOGGLE_SAFEGUARD',
      enabled: e.target.checked,
    });
  });
});
