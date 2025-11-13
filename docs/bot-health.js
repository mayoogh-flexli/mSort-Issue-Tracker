const BotHealth = {
    autoRefreshInterval: null,
    autoRefreshEnabled: false,
    botIds: [],
    issuesData: [],
    components: [
        'Motherboard',
        'Station Reader',
        'WTM Reader',
        'AFC',
        'Drive Motor',
        'Diverter',
        'Electromagnet',
        'LCD Display',
        'Indicator Light',
        'Panel Button',
        'Panel Button LED',
        'Power Supply',
        'Wiring/Connectors',
        'Sensors',
        'Other'
    ],

    init() {
        this.updateRepoLink();
        this.loadSavedConfig();
        
        const popup = document.createElement('div');
        popup.id = 'issuePopup';
        popup.className = 'issue-popup';
        document.body.appendChild(popup);
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.component-item') && !e.target.closest('.issue-popup')) {
                this.hidePopup();
            }
        });
    },

    updateRepoLink() {
        const link = document.getElementById('repoLink');
        if (link) {
            link.href = `https://github.com/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}`;
            link.textContent = `${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}`;
        }
    },

    loadSavedConfig() {
        const saved = localStorage.getItem('botHealthConfig');
        if (saved) {
            const config = JSON.parse(saved);
            document.getElementById('botStart').value = config.start || 1;
            document.getElementById('botEnd').value = config.end || 20;
            document.getElementById('botManual').value = config.manual || '';
            
            if (config.botIds && config.botIds.length > 0) {
                this.botIds = config.botIds;
                this.load();
            }
        }
    },

    saveConfig() {
        const config = {
            start: document.getElementById('botStart').value,
            end: document.getElementById('botEnd').value,
            manual: document.getElementById('botManual').value,
            botIds: this.botIds
        };
        localStorage.setItem('botHealthConfig', JSON.stringify(config));
    },

    generateRange() {
        const start = parseInt(document.getElementById('botStart').value);
        const end = parseInt(document.getElementById('botEnd').value);
        
        if (start > end) {
            alert('Start must be less than or equal to End');
            return;
        }
        
        if (end - start > 100) {
            alert('Maximum range is 100 bots');
            return;
        }
        
        this.botIds = [];
        for (let i = start; i <= end; i++) {
            this.botIds.push(`B${i}`);
        }
        
        this.saveConfig();
        this.load();
    },

    generateManual() {
        const input = document.getElementById('botManual').value;
        if (!input.trim()) {
            alert('Please enter bot IDs');
            return;
        }
        
        this.botIds = input
            .split(/[,\s]+/)
            .map(id => id.trim())
            .filter(id => id)
            .map(id => id.toUpperCase().startsWith('B') ? id.toUpperCase() : `B${id}`)
            .filter(id => /^B\d+$/.test(id));
        
        if (this.botIds.length === 0) {
            alert('No valid bot IDs found. Use format: B1, B5, B10');
            return;
        }
        
        this.saveConfig();
        this.load();
    },

    async load() {
        if (this.botIds.length === 0) {
            document.getElementById('healthCards').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🤖</div>
                    <h3>Configure Bots Above</h3>
                    <p>Select a bot range or manually enter bot IDs to view their health status</p>
                </div>
            `;
            document.getElementById('summaryStats').innerHTML = '';
            return;
        }
        
        this.showLoading('Loading bot health data...');

        try {
            const headers = {
                'Accept': 'application/vnd.github.v3+json'
            };

            const response = await fetch(
                `${window.MSORT_CONFIG.GITHUB_API_BASE}/repos/${window.MSORT_CONFIG.REPO_OWNER}/${window.MSORT_CONFIG.REPO_NAME}/issues?labels=robot-issue&state=open&per_page=100`,
                { headers }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const issues = await response.json();
            this.issuesData = issues.map(issue => this.parseIssueData(issue));
            this.renderSummary();
            this.render();
            this.updateLastUpdated();

        } catch (error) {
            this.showError(`Error loading data: ${error.message}`);
        }
    },

    parseIssueData(issue) {
        const body = issue.body || '';
        const title = issue.title || '';
        
        const botIdMatch = title.match(/\[([^\]]+)\]/);
        const botId = botIdMatch ? botIdMatch[1].toUpperCase() : 'Unknown';

        const componentMatch = body.match(/###\s*Affected Component\s*\n\s*(.+)/i);
        const component = componentMatch ? componentMatch[1].trim() : 'Unknown';

        const compStatusMatch = body.match(/###\s*Component Status\s*\n\s*(.+)/i);
        const componentStatus = compStatusMatch ? compStatusMatch[1].trim() : 'Unknown';

        let priority = 'p3';
        const priorityLabel = issue.labels.find(l => l.name.match(/p[0-3]/i));
        if (priorityLabel) {
            priority = priorityLabel.name.toLowerCase();
        }

        const categoryMatch = body.match(/###\s*Issue Category\s*\n\s*(.+)/i);
        const category = categoryMatch ? categoryMatch[1].trim() : 'Unknown';

        const clarityMatch = body.match(/###\s*Clarity of the Issue\s*\n\s*(.+)/i);
        const clarity = clarityMatch ? clarityMatch[1].trim() : 'Unknown';

        const descMatch = body.match(/###\s*Issue Description\s*\n\s*(.+?)(?=\n###|\n\n|$)/is);
        const description = descMatch ? descMatch[1].trim().substring(0, 200) : '';

        const issueTitle = title.replace(/\[[^\]]+\]\s*/, '').trim();

        let severity = 'healthy';
        const statusLower = componentStatus.toLowerCase();
        if (statusLower.includes('non-functional') || statusLower.includes('completely down')) {
            severity = 'critical';
        } else if (statusLower.includes('intermittent') || 
                   statusLower.includes('degraded') ||
                   statusLower.includes('error')) {
            severity = 'degraded';
        }

        return {
            botId,
            component,
            componentStatus,
            priority,
            category,
            clarity,
            description,
            issueTitle,
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            createdAt: issue.created_at,
            severity
        };
    },

    getComponentHealth(botId, component) {
        const issue = this.issuesData.find(i => 
            i.botId === botId && 
            i.component.toLowerCase() === component.toLowerCase()
        );
        
        return issue ? { status: issue.severity, issue } : { status: 'healthy', issue: null };
    },

    getBotOverallStatus(botId) {
        let hasCritical = false;
        let hasDegraded = false;
        let healthyCount = 0;
        
        this.components.forEach(component => {
            const health = this.getComponentHealth(botId, component);
            if (health.status === 'critical') hasCritical = true;
            else if (health.status === 'degraded') hasDegraded = true;
            else healthyCount++;
        });
        
        return {
            status: hasCritical ? 'critical' : hasDegraded ? 'degraded' : 'healthy',
            healthyCount,
            totalComponents: this.components.length
        };
    },

    renderSummary() {
        let healthyBots = 0;
        let degradedBots = 0;
        let criticalBots = 0;

        this.botIds.forEach(botId => {
            const status = this.getBotOverallStatus(botId);
            if (status.status === 'healthy') healthyBots++;
            else if (status.status === 'degraded') degradedBots++;
            else if (status.status === 'critical') criticalBots++;
        });

        document.getElementById('summaryStats').innerHTML = `
            <div class="health-summary-stats">
                <h3>Fleet Overview</h3>
                <div class="health-stats-grid">
                    <div class="health-stat-item total">
                        <div class="health-stat-label">Total Bots</div>
                        <div class="health-stat-value">${this.botIds.length}</div>
                    </div>
                    <div class="health-stat-item healthy">
                        <div class="health-stat-label">Healthy</div>
                        <div class="health-stat-value">${healthyBots}</div>
                    </div>
                    <div class="health-stat-item degraded">
                        <div class="health-stat-label">Degraded</div>
                        <div class="health-stat-value">${degradedBots}</div>
                    </div>
                    <div class="health-stat-item critical">
                        <div class="health-stat-label">Critical</div>
                        <div class="health-stat-value">${criticalBots}</div>
                    </div>
                </div>
            </div>
        `;
    },

    render() {
        if (this.botIds.length === 0) return;

        let html = '<div class="health-grid">';

        this.botIds.forEach(botId => {
            const overallStatus = this.getBotOverallStatus(botId);
            
            html += `
                <div class="bot-health-card ${overallStatus.status}">
                    <div class="bot-health-header">
                        <div class="bot-health-id">${botId}</div>
                        <div class="bot-health-status ${overallStatus.status}">
                            ${overallStatus.status === 'healthy' ? '✓ Operational' : 
                              overallStatus.status === 'degraded' ? '⚠ Degraded' : 
                              '✗ Critical'}
                        </div>
                        <div class="bot-health-summary">
                            ${overallStatus.healthyCount} / ${overallStatus.totalComponents} subsystems healthy
                        </div>
                    </div>
                    <div class="component-list">
            `;

            this.components.forEach(component => {
                const health = this.getComponentHealth(botId, component);
                const hasIssue = health.issue !== null;
                
                html += `
                    <div class="component-item ${hasIssue ? 'has-issue' : ''}" 
                         ${hasIssue ? `data-bot="${botId}" data-component="${component}"` : ''}>
                        <span class="component-name">${component}</span>
                        <span class="component-health ${health.status}">
                            <span class="status-icon">${health.status === 'healthy' ? '●' : health.status === 'degraded' ? '●' : '●'}</span>
                            ${health.status.toUpperCase()}
                        </span>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';

        document.getElementById('healthCards').innerHTML = html;
        
        document.querySelectorAll('.component-item.has-issue').forEach(item => {
            item.addEventListener('click', (e) => {
                const botId = item.getAttribute('data-bot');
                const component = item.getAttribute('data-component');
                this.showPopup(e, botId, component);
            });
        });
    },

    showPopup(event, botId, component) {
        event.stopPropagation();
        
        const health = this.getComponentHealth(botId, component);
        if (!health.issue) return;

        const issue = health.issue;
        const popup = document.getElementById('issuePopup');
        
        const timeSince = this.getTimeSince(issue.createdAt);
        
        popup.innerHTML = `
            <h4>${issue.issueTitle}</h4>
            <div class="issue-popup-row">
                <strong>Component:</strong>
                <span>${issue.component}</span>
            </div>
            <div class="issue-popup-row">
                <strong>Status:</strong>
                <span>${issue.componentStatus}</span>
            </div>
            <div class="issue-popup-row">
                <strong>Priority:</strong>
                <span class="priority-badge ${issue.priority}">${issue.priority.toUpperCase()}</span>
            </div>
            <div class="issue-popup-row">
                <strong>Category:</strong>
                <span class="category-badge ${issue.category.toLowerCase()}">${issue.category}</span>
            </div>
            <div class="issue-popup-row">
                <strong>Duration:</strong>
                <span>${timeSince}</span>
            </div>
            ${issue.description ? `<div class="issue-popup-description">${issue.description}${issue.description.length === 200 ? '...' : ''}</div>` : ''}
            <a href="${issue.issueUrl}" target="_blank" class="issue-popup-link">View Full Issue #${issue.issueNumber}</a>
        `;
        
        const rect = event.target.closest('.component-item').getBoundingClientRect();
        const popupWidth = 350;
        const windowWidth = window.innerWidth;
        
        let left = rect.left;
        if (left + popupWidth > windowWidth) {
            left = windowWidth - popupWidth - 20;
        }
        
        popup.style.left = `${left}px`;
        popup.style.top = `${rect.bottom + window.scrollY + 10}px`;
        popup.classList.add('show');
    },

    hidePopup() {
        const popup = document.getElementById('issuePopup');
        popup.classList.remove('show');
    },

    getTimeSince(dateString) {
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now - past;
        
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m`;
        }
    },

    showLoading(message) {
        document.getElementById('healthCards').innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <span>${message}</span>
            </div>
        `;
        document.getElementById('summaryStats').innerHTML = '';
    },

    showError(message) {
        document.getElementById('healthCards').innerHTML = `
            <div class="error">
                <strong>Error:</strong> ${message}
                <br><br>
                <button class="btn" onclick="BotHealth.load()">Try Again</button>
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
    BotHealth.init();
});
