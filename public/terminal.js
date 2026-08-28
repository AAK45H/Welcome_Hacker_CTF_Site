// ========================================
// TERMINAL PAGE - SECURE COMMAND HANDLER
// ========================================

// Virtual Filesystem Class
class VirtualFileSystem {
    constructor() {
        this.fsData = null;
        this.currentPath = '/';
        this.commandHistory = [];
        this.historyIndex = -1;
    }

    async load() {
        try {
            const response = await fetch('/api/filesystem');
            this.fsData = await response.json();
            console.log('Virtual filesystem loaded');
        } catch (error) {
            console.error('Failed to load filesystem:', error);
            this.fsData = { filesystem: { "/": { type: "directory", name: "/", children: [] } } };
        }
    }

    resolvePath(path) {
        if (!path || path === '/') return '/';

        let resolved = path.startsWith('/') ? path : this.currentPath + '/' + path;
        resolved = resolved.replace(/\/+/g, '/');
        resolved = resolved.replace(/\/(\w+)\/\.\./g, '/');
        if (resolved.endsWith('/') && resolved.length > 1) {
            resolved = resolved.slice(0, -1);
        }
        return resolved;
    }

    getNode(path) {
        const resolved = this.resolvePath(path);
        if (resolved === '/') return this.fsData?.filesystem?.['/'] || null;

        const parts = resolved.split('/').filter(p => p);
        let current = this.fsData?.filesystem?.['/'];
        if (!current) return null;

        for (const part of parts) {
            if (current.type !== 'directory' || !current.children) return null;
            const found = current.children.find(child => child.name === part);
            if (!found) return null;
            current = found;
        }
        return current;
    }

    listDirectory(path) {
        const node = this.getNode(path);
        if (!node || node.type !== 'directory') {
            return { error: `ls: cannot access '${path}': Not a directory` };
        }

        const entries = (node.children || [])
            .filter(child => !child.hidden)
            .map(child => ({
                name: child.name,
                type: child.type,
                permissions: child.permissions || 'read-write'
            }));

        return { entries, path: this.resolvePath(path) };
    }

    changeDirectory(path) {
        const targetPath = this.resolvePath(path);
        const node = this.getNode(targetPath);

        if (!node || node.type !== 'directory') {
            return { error: `cd: ${path}: No such file or directory` };
        }

        this.currentPath = targetPath;
        return { path: this.currentPath };
    }

    viewFile(path) {
        const node = this.getNode(path);
        if (!node) {
            return { error: `cat: ${path}: No such file or directory` };
        }

        if (node.type === 'directory') {
            return { error: `cat: ${path}: Is a directory` };
        }

        if (node.hidden && node.name !== '.flag.txt') {
            return { error: `cat: ${path}: No such file or directory` };
        }

        return { content: node.content || '', path: this.resolvePath(path) };
    }


    addToHistory(cmd) {
        if (cmd.trim() && this.commandHistory[this.commandHistory.length - 1] !== cmd.trim()) {
            this.commandHistory.push(cmd.trim());
        }
        this.historyIndex = this.commandHistory.length;
    }
}

// Terminal UI Class
class TerminalUI {
    constructor(vfs) {
        this.vfs = vfs;
        this.outputArea = document.getElementById('outputArea');
        this.input = document.getElementById('terminalInput');
        this.promptDisplay = document.getElementById('promptDisplay');
        this.cursor = document.querySelector('.cursor-blink');

        this.bindEvents();
        this.focusInput();
    }

    bindEvents() {
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.input.addEventListener('input', () => this.hideCursor());

        // Keep focus on input when clicking anywhere in terminal
        document.querySelector('.terminal-body')?.addEventListener('click', () => this.focusInput());
    }

    focusInput() {
        this.input.focus();
        this.hideCursor();
    }

    hideCursor() {
        this.cursor.style.display = 'none';
    }

    showCursor() {
        this.cursor.style.display = 'block';
    }

    updatePrompt() {
        const path = this.vfs.currentPath;
        const shortPath = path === '/' ? '~' : path.split('/').pop() || '~';
        this.promptDisplay.textContent = `root@hacker:${shortPath}$`;
    }

    appendOutput(html, isError = false) {
        const div = document.createElement('div');
        div.className = isError ? 'output-line error' : 'output-line';
        div.innerHTML = html;
        this.outputArea.appendChild(div);
        this.outputArea.scrollTop = this.outputArea.scrollHeight;
    }

    appendCommand(cmd) {
        const div = document.createElement('div');
        div.className = 'command-line';
        div.innerHTML = `<span class="prompt">${this.promptDisplay.textContent}</span> <span class="command">${this.escapeHtml(cmd)}</span>`;
        this.outputArea.appendChild(div);
        this.outputArea.scrollTop = this.outputArea.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async handleKeydown(e) {
        if (e.key === 'Enter') {
            const cmd = this.input.value.trim();
            this.input.value = '';
            this.showCursor();

            if (!cmd) return;

            this.appendCommand(cmd);
            this.vfs.addToHistory(cmd);
            await this.executeCommand(cmd);
            this.updatePrompt();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.vfs.historyIndex > 0) {
                this.vfs.historyIndex--;
                this.input.value = this.vfs.commandHistory[this.vfs.historyIndex] || '';
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.vfs.historyIndex < this.vfs.commandHistory.length - 1) {
                this.vfs.historyIndex++;
                this.input.value = this.vfs.commandHistory[this.vfs.historyIndex] || '';
            } else {
                this.vfs.historyIndex = this.vfs.commandHistory.length;
                this.input.value = '';
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this.handleTabComplete();
        }
    }

    handleTabComplete() {
        const input = this.input.value.trim();
        const parts = input.split(' ');
        const lastPart = parts[parts.length - 1];

        if (parts.length === 1) {
            // Complete command
            const commands = ['ls', 'cd', 'cat', 'pwd', 'help', 'clear', 'history', 'whoami'];
            const matches = commands.filter(c => c.startsWith(lastPart));
            if (matches.length === 1) {
                this.input.value = matches[0] + ' ';
            } else if (matches.length > 1) {
                this.appendOutput(matches.join('  '));
            }
        } else if (parts.length === 2 && ['cd', 'cat', 'find'].includes(parts[0])) {
            // Complete path
            const node = this.vfs.getNode(this.vfs.resolvePath(parts[0] === 'find' ? '/' : this.vfs.currentPath));
            if (node && node.children) {
                const matches = node.children
                    .filter(c => c.name.startsWith(lastPart) && !c.hidden)
                    .map(c => c.name);
                if (matches.length === 1) {
                    this.input.value = parts.slice(0, -1).join(' ') + ' ' + matches[0];
                } else if (matches.length > 1) {
                    this.appendOutput(matches.join('  '));
                }
            }
        }
    }

    async executeCommand(cmd) {
        const parts = cmd.split(' ').filter(p => p);
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Show loading indicator
        this.showCursor();
        this.input.disabled = true;

        try {
            const response = await fetch('/api/terminal/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, args, cwd: this.vfs.currentPath })
            });

            const data = await response.json();

            if (!response.ok) {
                this.appendOutput(this.escapeHtml(data.error || 'Command failed'), true);
            } else {
                this.handleCommandResult(data, command);
            }
        } catch (error) {
            this.appendOutput(this.escapeHtml('Error: Failed to execute command'), true);
            console.error('Command execution error:', error);
        } finally {
            this.input.disabled = false;
            this.focusInput();
        }
    }

    handleCommandResult(data, command) {
        switch (command) {
            case 'ls':
                if (data.entries && data.entries.length > 0) {
                    const items = data.entries.map(e =>
                        `<span class="${e.type === 'directory' ? 'dir' : 'file'}">${this.escapeHtml(e.name)}${e.type === 'directory' ? '/' : ''}</span>`
                    ).join('  ');
                    this.appendOutput(items);
                } else {
                    this.appendOutput('<span class="muted">(empty)</span>');
                }
                break;

            case 'cd':
                if (data.path !== undefined) {
                    this.vfs.currentPath = data.path;
                } else if (data.error) {
                    this.appendOutput(this.escapeHtml(data.error), true);
                }
                break;

            case 'cat':
                if (data.content !== undefined) {
                    const formatted = this.escapeHtml(data.content).replace(/\n/g, '<br>');
                    this.appendOutput(formatted);
                } else if (data.error) {
                    this.appendOutput(this.escapeHtml(data.error), true);
                }
                break;

            case 'pwd':
                this.appendOutput(this.escapeHtml(this.vfs.currentPath));
                break;

            case 'help':
                this.showHelp();
                break;

            case 'clear':
                this.outputArea.innerHTML = '';
                break;

            case 'whoami':
                this.appendOutput('root');
                break;

            default:
                this.appendOutput(this.escapeHtml(`${command}: command not found`), true);
                this.appendOutput('Type <span class="cmd">help</span> for available commands');
        }
    }

    showHelp() {
        const help = `
            <div class="help-output">
                <h4>Available Commands</h4>
                <div class="help-list">
                    <div><span class="cmd">ls [path]</span> - List directory contents</div>
                    <div><span class="cmd">cd [path]</span> - Change directory</div>
                    <div><span class="cmd">cat [file]</span> - View file contents</div>
                    <div><span class="cmd">pwd</span> - Print working directory</div>
                    <div><span class="cmd">help</span> - Show this help</div>
                    <div><span class="cmd">clear</span> - Clear terminal</div>
                    <div><span class="cmd">whoami</span> - Display current user</div>
        `;
        this.appendOutput(help);
    }
}

// Initialize Terminal
document.addEventListener('DOMContentLoaded', async () => {
    const vfs = new VirtualFileSystem();
    await vfs.load();

    const terminal = new TerminalUI(vfs);
    terminal.updatePrompt();

    // Console easter egg
    console.log(`
%c╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🖥️  HACKER TERMINAL - SECURE MODE                       ║
║                                                           ║
║   All commands validated server-side                      ║
║   Virtual filesystem - no real system access              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`, 'color: #00ff88; font-family: monospace;');
});