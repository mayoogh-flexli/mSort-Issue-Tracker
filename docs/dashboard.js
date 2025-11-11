const Dashboard = {
    autoRefreshInterval: null,
    autoRefreshEnabled: false,

    init() {
        this.updateRepoLink();
        this.load();
    },

    updateRepoLink() {
        const link = document.getElementById('repoLink');
        if (link) {
            link.href = `https://github.com/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}`;
            link.textContent = `${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}`;
        }
    },

    async load() {
        this.showLoading('Loading robot status...');

        try {
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await fetch(
                `${window.MSORT_CONFIG.GITHUB_API_BASE}/repos/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}/issues?labels=robot-issue&state=open`,
                { headers }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const issues = await response.json();
            this.render(issues);
            this.updateLastUpdated();

        } catch (error) {
            this.showError(`Error loading data: ${error.message}`);
        }
    },

    parseIssueData(issue) {
        const body = issue.body || '';
        const title = issue.title || '';
        
        const botIdMatch = title.match(/\[([^\]]+)\]/);
        const botId = botIdMatch ? botIdMatch[1] : 'Unknown';

        const componentMatch = body.match(/###\s*📂 Affected Component\s*\n\s*(.+)/i);
        const component = componentMatch ? componentMatch[1].trim() : 'Unknown';

        let status = 'operational';
        const labelNames = issue.labels.map(l => l.name.toLowerCase());
        
        if (labelNames.includes('bot-down')) {
            status = 'down';
        } else if (labelNames.includes('bot-degraded')) {
            status = 'degraded';
        } else {
            const statusMatch = body.match(/###\s*🚦 Bot Operational Status\s*\n\s*(.+)/i);
            if (statusMatch) {
                const statusText = statusMatch[1].toLowerCase();
                if (statusText.includes('down')) status = 'down';
                else if (statusText.includes('degraded')) status = 'degraded';
            }
        }

        const compStatusMatch = body.match(/###\s*🔧 Component Status\s*\n\s*(.+)/i);
        const componentStatus = compStatusMatch ? compStatusMatch[1].trim() : 'Unknown';

        let priority = 'p3';
        const priorityLabel = issue.labels.find(l => l.name.match(/p[0-3]/i));
        if (priorityLabel) {
            priority = priorityLabel.name.toLowerCase();
        } else {
            const priorityMatch = body.match(/###\s*🚨 Priority\s*\n\s*(P[0-3])/i);
            if (priorityMatch) {
                priority = priorityMatch[1].toLowerCase();
            }
        }

        const timeMatch = body.match(/###\s*⏰ Issue Start Time\s*\n\s*(.+)/i);
        const issueTime = timeMatch ? timeMatch[1].trim() : '';

        const issueTitle = title.replace(/\[[^\]]+\]\s*/, '').trim();

        return {
            botId,
            component,
            status,
            componentStatus,
            priority,
            issueTime,
            issueTitle,
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            createdAt: issue.created_at
        };
    },

    render(issues) {
        if (issues.length === 0) {
            document.getElementById('content').innerHTML = `
                <div class="no-issues">
                    <h2>✅ All Systems Operational</h2>
                    <p>No open robot issues found. All bots are running smoothly!</p>
                </div>
            `;
            return;
        }

        const parsedIssues = issues.map(issue => this.parseIssueData(issue));

        const stats = {
            total: parsedIssues.length,
            operational: parsedIssues.filter(i => i.status === 'operational').length,
            degraded: parsedIssues.filter(i => i.status === 'degraded').length,
            down: parsedIssues.filter(i => i.status === 'down').length,
            critical: parsedIssues.filter(i => i.priority === 'p0').length
        };

        const botGroups = {};
        parsedIssues.forEach(issue => {
            if (!botGroups[issue.botId]) {
                botGroups[issue.botId] = [];
            }
            botGroups[issue.botId].push(issue);
        });

        const sortedBots = Object.keys(botGroups).sort((a, b) => {
            const statusPriority = { down: 0, degraded: 1, operational: 2 };
            const statusA = Math.min(...botGroups[a].map(i => statusPriority[i.status]));
            const statusB = Math.min(...botGroups[b].map(i => statusPriority[i.status]));
            return statusA - statusB;
        });

        let html = `
            <div class="stats">
                <div class="stat-card">
                    <h3>Total Issues</h3>
                    <div class="number">${stats.total}</div>
                </div>
                <div class="stat-card operational">
                    <h3>Operational</h3>
                    <div class="number">${stats.operational}</div>
                </div>
                <div class="stat-card degraded">
                    <h3>Degraded</h3>
                    <div class="number">${stats.degraded}</div>
                </div>
                <div class="stat-card down">
                    <h3>Down</h3>
                    <div class="number">${stats.down}</div>
                </div>
                <div class="stat-card down">
                    <h3>Critical (P0)</h3>
                    <div class="number">${stats.critical}</div>
                </div>
            </div>

            <div class="bot-grid">
        `;

        sortedBots.forEach(botId => {
            const botIssues = botGroups[botId];
            const worstStatus = botIssues.some(i => i.status === 'down') ? 'down' :
                               botIssues.some(i => i.status === 'degraded') ? 'degraded' : 'operational';
            
            html += `
                <div class="bot-card ${worstStatus}">
                    <div class="bot-header">
                        <div class="bot-id">${botId}</div>
                        <div class="status-badge ${worstStatus}">
                            ${worstStatus === 'down' ? '🔴 Down' : 
                              worstStatus === 'degraded' ? '🟡 Degraded' : '🟢 Operational'}
                        </div>
                    </div>
            `;

            botIssues.forEach(issue => {
                const timeDisplay = issue.issueTime || this.formatDate(issue.createdAt);
                const timeSince = this.getTimeSince(issue.createdAt);
                
                html += `
                    <div class="issue-info">
                        <div class="issue-row" style="margin-bottom: 10px;">
                            <strong style="color: #333; font-size: 15px;">${issue.issueTitle}</strong>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Component:</span>
                            <span class="issue-value">${issue.component}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Status:</span>
                            <span class="issue-value">${issue.componentStatus}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Priority:</span>
                            <span class="priority-badge ${issue.priority}">${issue.priority.toUpperCase()}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Started:</span>
                            <span class="issue-value">${timeDisplay}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Duration:</span>
                            <span class="issue-value">${timeSince}</span>
                        </div>
                        <a href="${issue.issueUrl}" target="_blank" class="issue-link">
                            View Issue #${issue.issueNumber} →
                        </a>
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += `</div>`;

        document.getElementById('content').innerHTML = html;
    },

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },

    getTimeSince(dateString) {
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now - past;
        
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes % 60}m`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    },

    showLoading(message) {
        document.getElementById('content').innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                ${message}
            </div>
        `;
    },

    showError(message) {
        document.getElementById('content').innerHTML = `
            <div class="error">
                <strong>⚠️ Error:</strong> ${message}
                <br><br>
                <button class="btn" onclick="Dashboard.load()">Try Again</button>
            </div>
        `;
    },

    updateLastUpdated() {
        const now = new Date();
        const elem = document.getElementById('lastUpdated');
        if (elem) {
            elem.textContent = `Last updated: ${now.toLocaleString()}`;
        }
    },

    toggleAutoRefresh() {
        this.autoRefreshEnabled = !this.autoRefreshEnabled;
        const btn = document.getElementById('autoRefreshText');

        if (this.autoRefreshEnabled) {
            btn.textContent = '⏸ Disable Auto-Refresh';
            this.autoRefreshInterval = setInterval(() => {
                this.load();
            }, window.MSORT_CONFIG.AUTO_REFRESH_INTERVAL);
        } else {
            btn.textContent = 'Enable Auto-Refresh';
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
            }
        }
    }
};

// Initialize dashboard when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    Dashboard.init();
});