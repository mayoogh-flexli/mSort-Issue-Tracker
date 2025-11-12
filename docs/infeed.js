const Infeed = {
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
        this.showLoading('Loading infeed issues...');

        try {
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await fetch(
                `${window.MSORT_CONFIG.GITHUB_API_BASE}/repos/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}/issues?labels=infeed-issue&state=open`,
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

        const componentMatch = body.match(/###\s*Affected Component\s*\n\s*(.+)/i);
        const component = componentMatch ? componentMatch[1].trim() : 'Unknown';

        const categoryMatch = body.match(/###\s*Issue Category\s*\n\s*(.+)/i);
        const category = categoryMatch ? categoryMatch[1].trim() : 'Unknown';

        const clarityMatch = body.match(/###\s*Clarity of the Issue\s*\n\s*(.+)/i);
        const clarity = clarityMatch ? clarityMatch[1].trim() : 'Unknown';

        const compStatusMatch = body.match(/###\s*Component Status\s*\n\s*(.+)/i);
        const componentStatus = compStatusMatch ? compStatusMatch[1].trim() : 'Unknown';

        let priority = 'p3';
        const priorityLabel = issue.labels.find(l => l.name.match(/p[0-3]/i));
        if (priorityLabel) {
            priority = priorityLabel.name.toLowerCase();
        } else {
            const priorityMatch = body.match(/###\s*Priority\s*\n\s*(P[0-3])/i);
            if (priorityMatch) {
                priority = priorityMatch[1].toLowerCase();
            }
        }

        const timeMatch = body.match(/###\s*Issue Start Time\s*\n\s*(.+)/i);
        const issueTime = timeMatch ? timeMatch[1].trim() : '';

        const issueTitle = title.replace(/\[Infeed\]\s*/i, '').trim();

        return {
            component,
            category,
            clarity,
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
                    <h2>All Infeed Systems Operational</h2>
                    <p>No open infeed issues found</p>
                </div>
            `;
            return;
        }

        const parsedIssues = issues.map(issue => this.parseIssueData(issue));

        const stats = {
            total: parsedIssues.length,
            critical: parsedIssues.filter(i => i.priority === 'p0').length,
            high: parsedIssues.filter(i => i.priority === 'p1').length,
            medium: parsedIssues.filter(i => i.priority === 'p2').length,
            low: parsedIssues.filter(i => i.priority === 'p3').length
        };

        let html = `
            <div class="stats">
                <div class="stat-card">
                    <h3>Total Issues</h3>
                    <div class="number">${stats.total}</div>
                </div>
                <div class="stat-card down">
                    <h3>Critical</h3>
                    <div class="number">${stats.critical}</div>
                </div>
                <div class="stat-card degraded">
                    <h3>High</h3>
                    <div class="number">${stats.high}</div>
                </div>
                <div class="stat-card">
                    <h3>Medium</h3>
                    <div class="number">${stats.medium}</div>
                </div>
                <div class="stat-card operational">
                    <h3>Low</h3>
                    <div class="number">${stats.low}</div>
                </div>
            </div>

            <div class="bot-grid">
        `;

        parsedIssues.forEach(issue => {
            const statusClass = issue.priority === 'p0' ? 'down' : issue.priority === 'p1' ? 'degraded' : 'operational';
            const timeDisplay = issue.issueTime || this.formatDate(issue.createdAt);
            const timeSince = this.getTimeSince(issue.createdAt);
            
            html += `
                <div class="bot-card ${statusClass}">
                    <div class="bot-header">
                        <div class="bot-id">${issue.issueTitle}</div>
                        <div class="status-badge ${statusClass}">
                            ${issue.componentStatus.split('(')[0].trim().toUpperCase()}
                        </div>
                    </div>
                    
                    <div class="issue-info">
                        <div class="issue-row">
                            <span class="issue-label">Component:</span>
                            <span class="issue-value">${issue.component}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Category:</span>
                            <span class="category-badge ${issue.category.toLowerCase()}">${issue.category}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Status:</span>
                            <span class="issue-value">${issue.componentStatus}</span>
                        </div>
                        <div class="issue-row">
                            <span class="issue-label">Clarity:</span>
                            <span class="clarity-badge ${issue.clarity.toLowerCase()}">${issue.clarity}</span>
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
                            View Issue #${issue.issueNumber}
                        </a>
                    </div>
                </div>
            `;
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
                <strong>Error:</strong> ${message}
                <br><br>
                <button class="btn" onclick="Infeed.load()">Try Again</button>
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
            btn.textContent = 'Disable Auto-Refresh';
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

window.addEventListener('DOMContentLoaded', () => {
    Infeed.init();
});