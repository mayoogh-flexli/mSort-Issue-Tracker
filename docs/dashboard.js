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

        const componentMatch = body.match(/###\s*Affected Component\s*\n\s*(.+)/i);
        const component = componentMatch ? componentMatch[1].trim() : 'Unknown';

        const categoryMatch = body.match(/###\s*Issue Category\s*\n\s*(.+)/i);
        const category = categoryMatch ? categoryMatch[1].trim() : 'Unknown';

        const clarityMatch = body.match(/###\s*Clarity of the Issue\s*\n\s*(.+)/i);
        const clarity = clarityMatch ? clarityMatch[1].trim() : 'Unknown';

        let status = 'operational';
        const labelNames = issue.labels.map(l => l.name.toLowerCase());
        
        if (labelNames.includes('bot-down')) {
            status = 'down';
        } else if (labelNames.includes('bot-degraded')) {
            status = 'degraded';
        } else {
            const statusMatch = body.match(/###\s*Bot Operational Status\s*\n\s*(.+)/i);
            if (statusMatch) {
                const statusText = statusMatch[1].toLowerCase();
                if (statusText.includes('down')) status = 'down';
                else if (statusText.includes('degraded')) status = 'degraded';
            }
        }

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

        const issueTitle = title.replace(/\[[^\]]+\]\s*/, '').trim();

        return {
            botId,
            component,
            category,
            clarity,
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
                    <h2>All Systems Operational</h2>
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
            critical: parsedIssues.filter
