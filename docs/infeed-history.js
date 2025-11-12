const InfeedHistory = {
    allIssues: [],
    filteredIssues: [],

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
        this.showLoading('Loading infeed issue history...');

        try {
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await fetch(
                `${window.MSORT_CONFIG.GITHUB_API_BASE}/repos/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}/issues?labels=infeed-issue&state=all&per_page=100`,
                { headers }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const issues = await response.json();
            this.allIssues = issues.map(issue => this.parseIssueData(issue));
            this.filteredIssues = [...this.allIssues];
            
            this.populateFilters();
            this.renderInfeedSummary();
            this.render();
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
            state: issue.state,
            createdAt: issue.created_at,
            closedAt: issue.closed_at,
            updatedAt: issue.updated_at
        };
    },

    populateFilters() {
        const components = [...new Set(this.allIssues.map(i => i.component))].sort();
        const componentFilter = document.getElementById('componentFilter');
        components.forEach(component => {
            const option = document.createElement('option');
            option.value = component;
            option.textContent = component;
            componentFilter.appendChild(option);
        });
    },

    applyFilters() {
        const categoryFilter = document.getElementById('categoryFilter').value;
        const componentFilter = document.getElementById('componentFilter').value;
        const stateFilter = document.getElementById('stateFilter').value;

        this.filteredIssues = this.allIssues.filter(issue => {
            if (categoryFilter && issue.category !== categoryFilter) return false;
            if (componentFilter && issue.component !== componentFilter) return false;
            if (stateFilter && issue.state !== stateFilter) return false;
            return true;
        });

        this.renderInfeedSummary();
        this.render();
    },

    renderInfeedSummary() {
        const totalIssues = this.filteredIssues.length;
        const openIssues = this.filteredIssues.filter(i => i.state === 'open').length;
        const closedIssues = this.filteredIssues.filter(i => i.state === 'closed').length;
        const criticalIssues = this.filteredIssues.filter(i => i.priority === 'p0').length;

        const resolvedIssues = this.filteredIssues.filter(i => i.state === 'closed' && i.closedAt);
        let avgResolutionTime = 'N/A';
        
        if (resolvedIssues.length > 0) {
            const totalMinutes = resolvedIssues.reduce((sum, issue) => {
                const created = new Date(issue.createdAt);
                const closed = new Date(issue.closedAt);
                return sum + (closed - created) / 60000;
            }, 0);
            const avgMinutes = Math.round(totalMinutes / resolvedIssues.length);
            const hours = Math.floor(avgMinutes / 60);
            const mins = avgMinutes % 60;
            avgResolutionTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        }

        document.getElementById('infeedSummary').innerHTML = `
            <div class="bot-summary">
                <h3>Infeed System Summary</h3>
                <div class="bot-stats">
                    <div class="bot-stat-item">
                        <div class="label">Total Issues</div>
                        <div class="value">${totalIssues}</div>
                    </div>
                    <div class="bot-stat-item">
                        <div class="label">Open</div>
                        <div class="value" style="color: #e74c3c;">${openIssues}</div>
                    </div>
                    <div class="bot-stat-item">
                        <div class="label">Resolved</div>
                        <div class="value" style="color: #27ae60;">${closedIssues}</div>
                    </div>
                    <div class="bot-stat-item">
                        <div class="label">Critical</div>
                        <div class="value" style="color: #e74c3c;">${criticalIssues}</div>
                    </div>
                    <div class="bot-stat-item">
                        <div class="label">Avg Resolution</div>
                        <div class="value" style="color: #3498db;">${avgResolutionTime}</div>
                    </div>
                </div>
            </div>
        `;
    },

    render() {
        if (this.filteredIssues.length === 0) {
            document.getElementById('historyContent').innerHTML = `
                <div class="no-history">
                    <h2>No History Found</h2>
                    <p>No issues match the selected filters</p>
                </div>
            `;
            return;
        }

        const sortedIssues = [...this.filteredIssues].sort((a, b) => {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });

        let html = '<div class="history-grid">';

        sortedIssues.forEach(issue => {
            const resolutionTime = this.calculateResolutionTime(issue);
            
            html += `
                <div class="history-card ${issue.state}">
                    <div class="history-header">
                        <div class="history-title">
                            <h3>${issue.issueTitle}</h3>
                        </div>
                        <div class="history-meta">
                            <span class="bot-badge">Infeed</span>
                            <span class="state-badge ${issue.state}">
                                ${issue.state === 'open' ? 'OPEN' : 'RESOLVED'}
                            </span>
                            <span class="priority-badge ${issue.priority}">${issue.priority.toUpperCase()}</span>
                        </div>
                    </div>
                    
                    <div class="history-details">
                        <div class="detail-item">
                            <span class="detail-label">Component</span>
                            <span class="detail-value">${issue.component}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Category</span>
                            <span class="category-badge ${issue.category.toLowerCase()}">${issue.category}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Clarity</span>
                            <span class="clarity-badge ${issue.clarity.toLowerCase()}">${issue.clarity}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${issue.componentStatus}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Created</span>
                            <span class="detail-value">${this.formatDate(issue.createdAt)}</span>
                        </div>
                        ${issue.state === 'closed' ? `
                        <div class="detail-item">
                            <span class="detail-label">Resolved</span>
                            <span class="detail-value">${this.formatDate(issue.closedAt)}</span>
                        </div>
                        ` : `
                        <div class="detail-item">
                            <span class="detail-label">Last Updated</span>
                            <span class="detail-value">${this.formatDate(issue.updatedAt)}</span>
                        </div>
                        `}
                    </div>
                    
                    ${resolutionTime ? `
                    <div class="resolution-time">
                        Resolution Time: ${resolutionTime}
                    </div>
                    ` : ''}
                    
                    <a href="${issue.issueUrl}" target="_blank" class="issue-link">
                        View Issue #${issue.issueNumber}
                    </a>
                </div>
            `;
        });

        html += '</div>';

        document.getElementById('historyContent').innerHTML = html;
    },

    calculateResolutionTime(issue) {
        if (issue.state !== 'closed' || !issue.closedAt) {
            return null;
        }

        const created = new Date(issue.createdAt);
        const closed = new Date(issue.closedAt);
        const diffMs = closed - created;
        
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes % 60}m`;
        } else {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    },

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },

    showLoading(message) {
        document.getElementById('historyContent').innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                ${message}
            </div>
        `;
    },

    showError(message) {
        document.getElementById('historyContent').innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${message}
                <br><br>
                <button class="btn" onclick="InfeedHistory.load()">Try Again</button>
            </div>
        `;
    },

    updateLastUpdated() {
        const now = new Date();
        const elem = document.getElementById('lastUpdated');
        if (elem) {
            elem.textContent = `Last updated: ${now.toLocaleString()}`;
        }
    }
};

window.addEventListener('DOMContentLoaded', () => {
    InfeedHistory.init();
});