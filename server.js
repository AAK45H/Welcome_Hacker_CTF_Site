const express = require('express');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable compression for all responses
app.use(compression());

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
    etag: true,
    lastModified: true
}));

// Load virtual filesystem ONCE at module initialization (cached across invocations)
const virtualFS = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'data', 'virtual_fs.json'), 'utf8'));

// Pre-compute sanitized filesystem for /api/filesystem endpoint (cached)
let cachedSanitizedFS = null;
function getSanitizedFS() {
    if (cachedSanitizedFS) return cachedSanitizedFS;

    const sanitizedFS = JSON.parse(JSON.stringify(virtualFS));

    function sanitizeNode(node) {
        if (!node || !node.children) return node;

        node.children = node.children.map(child => {
            const sanitizedChild = {
                name: child.name,
                type: child.type,
                permissions: child.permissions
            };

            // Remove content from ALL hidden files
            if (child.hidden) {
                sanitizedChild.content = undefined;
            }

            // Recursively sanitize directories
            if (child.type === 'directory' && child.children) {
                sanitizedChild.children = sanitizeNode(child).children;
            }

            return sanitizedChild;
        });

        return node;
    }

    sanitizeNode(sanitizedFS.filesystem['/']);
    cachedSanitizedFS = sanitizedFS;
    return cachedSanitizedFS;
}

// API endpoint for dynamic hacker quotes
app.get('/api/quote', (req, res) => {
    const quotes = [
        { text: "The only truly secure system is one that is powered off, cast in a block of concrete and sealed in a lead-lined room with armed guards.", author: "Hacker" },
        { text: "In a world of locked rooms, the man with the key is king.", author: "Anonymous" },
        { text: "It's not a bug, it's an undocumented feature.", author: "Anonymous" },
        { text: "The best way to predict the future is to invent it.", author: "SkyVolt" },
        { text: "Any sufficiently advanced technology is indistinguishable from magic.", author: "Yagami" },
        { text: "First, solve the problem. Then, write the code.", author: "Lynx" },
        { text: "Code is like humor. When you have to explain it, it's bad.", author: "Mhmd" },
        { text: "In theory, there is no difference between theory and practice. In practice, there is.", author: "S.S.Nair" }
    ];

    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.json(randomQuote);
});

// API endpoint for stats
app.get('/api/stats', (req, res) => {
    res.set('Cache-Control', 'public, max-age=10, s-maxage=10');
    res.json({
        connections: Math.floor(Math.random() * 9999) + 1000,
        packets: Math.floor(Math.random() * 999999) + 100000,
        uptime: Math.floor(Math.random() * 720) + 480,
        bandwidth: (Math.random() * 100 + 50).toFixed(1)
    });
});

// API endpoint for virtual filesystem - uses cached sanitized copy
app.get('/api/filesystem', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json(getSanitizedFS());
});

// Secure Terminal Command Execution API
app.post('/api/terminal/execute', (req, res) => {
    const { command, args, cwd } = req.body;

    // Strict command whitelist - only allow predefined safe commands
    const ALLOWED_COMMANDS = ['ls', 'cd', 'cat', 'pwd', 'help', 'clear', 'find', 'grep', 'history', 'whoami'];

    // Validate command
    if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'Invalid command' });
    }

    const normalizedCmd = command.toLowerCase().trim();

    // Only allow whitelisted commands
    if (!ALLOWED_COMMANDS.includes(normalizedCmd)) {
        return res.status(400).json({ error: `${normalizedCmd}: command not found` });
    }

    // Validate args
    if (!Array.isArray(args)) {
        return res.status(400).json({ error: 'Invalid arguments' });
    }

    // Sanitize args - remove any potential injection attempts
    const sanitizedArgs = args.map(arg => {
        if (typeof arg !== 'string') return '';
        // Remove dangerous characters, keep only alphanumeric, /, ., -, _, ~, *, ?, [, ], {, }
        return arg.replace(/[^a-zA-Z0-9\/._~*?[\]{}-]/g, '').substring(0, 256);
    });

    // Validate cwd
    const currentDir = (typeof cwd === 'string' && cwd.startsWith('/')) ? cwd : '/';

    // Execute command safely
    try {
        const result = executeCommand(normalizedCmd, sanitizedArgs, currentDir);
        res.set('Cache-Control', 'no-store');
        res.json(result);
    } catch (error) {
        console.error('Command execution error:', error);
        res.status(500).json({ error: 'Command execution failed' });
    }
});

// Secure command execution - NO shell, NO eval, NO system calls
function executeCommand(command, args, cwd) {
    // Helper to get node from virtual FS
    function getNode(fsPath) {
        const resolved = fsPath === '/' ? '/' : fsPath.replace(/\/+/g, '/').replace(/\/(\w+)\/\.\./g, '/').replace(/\/$/, '');
        if (resolved === '/') return virtualFS.filesystem['/'];

        const parts = resolved.split('/').filter(p => p);
        let current = virtualFS.filesystem['/'];
        if (!current) return null;

        for (const part of parts) {
            if (current.type !== 'directory' || !current.children) return null;
            const found = current.children.find(child => child.name === part);
            if (!found) return null;
            current = found;
        }
        return current;
    }

    // Helper to resolve path
    function resolvePath(inputPath, baseDir) {
        if (!inputPath || inputPath === '/') return '/';
        let resolved = inputPath.startsWith('/') ? inputPath : baseDir + '/' + inputPath;
        resolved = resolved.replace(/\/+/g, '/');
        // Handle .. - but prevent escaping root
        const parts = resolved.split('/').filter(p => p);
        const finalParts = [];
        for (const part of parts) {
            if (part === '..') {
                if (finalParts.length > 0) finalParts.pop();
            } else if (part !== '.') {
                finalParts.push(part);
            }
        }
        return '/' + finalParts.join('/');
    }

    switch (command) {
        case 'ls': {
            // Parse ls flags
            const flags = { a: false, l: false };
            let targetPath = cwd;

            for (const arg of args) {
                if (arg.startsWith('-')) {
                    // Handle flags like -la, -a, -l, -al
                    for (const char of arg.slice(1)) {
                        if (char === 'a') flags.a = true;
                        if (char === 'l') flags.l = true;
                    }
                } else {
                    targetPath = resolvePath(arg, cwd);
                }
            }

            const node = getNode(targetPath);
            if (!node || node.type !== 'directory') {
                return { error: `ls: cannot access '${targetPath}': Not a directory` };
            }

            // Show hidden files if -a flag is used, but still hide flag.txt unless explicitly accessed
            const entries = (node.children || [])
                .filter(child => flags.a || !child.hidden)
                .filter(child => !(child.hidden && child.name === 'flag.txt' && !flags.a))
                .map(child => ({
                    name: child.name,
                    type: child.type,
                    permissions: child.permissions || 'read-write'
                }));
            return { entries, path: targetPath };
        }

        case 'cd': {
            const targetPath = args[0] ? resolvePath(args[0], cwd) : '/';
            const node = getNode(targetPath);
            if (!node || node.type !== 'directory') {
                return { error: `cd: ${args[0] || targetPath}: No such file or directory` };
            }
            return { path: targetPath };
        }

        case 'cat': {
            if (!args[0]) {
                return { error: 'cat: missing file operand' };
            }
            const targetPath = resolvePath(args[0], cwd);
            const node = getNode(targetPath);
            if (!node) {
                return { error: `cat: ${args[0]}: No such file or directory` };
            }
            if (node.type === 'directory') {
                return { error: `cat: ${args[0]}: Is a directory` };
            }
            if (node.hidden && node.name !== 'flag.txt') {
                return { error: `cat: ${args[0]}: No such file or directory` };
            }
            return { content: node.content || '', path: targetPath };
        }

        case 'pwd': {
            return { cwd };
        }

        case 'help': {
            return { help: true };
        }

        case 'clear': {
            return { clear: true };
        }

        case 'find': {
            // Support multiple syntaxes:
            // find [name] - search from root (single arg, not starting with / or -)
            // find [path] [name] - search from path (first arg starts with /, second is name)
            // find [path] -name [pattern] - Linux syntax
            // find -name [pattern] - search from root with -name flag
            let searchPath = '/';
            let searchName = '';

            if (args.length >= 1) {
                // Check for -name flag
                const nameFlagIndex = args.indexOf('-name');

                if (nameFlagIndex !== -1) {
                    // Linux syntax: find [path] -name [pattern] or find -name [pattern]
                    if (nameFlagIndex + 1 < args.length) {
                        searchName = args[nameFlagIndex + 1];
                    }

                    // Determine search path
                    if (nameFlagIndex === 0) {
                        // find -name [pattern]
                        searchPath = '/';
                    } else if (args[0].startsWith('/')) {
                        // find /path -name [pattern]
                        searchPath = resolvePath(args[0], cwd);
                    } else {
                        // find . -name [pattern] or find relative/path -name [pattern]
                        searchPath = resolvePath(args[0], cwd);
                    }
                } else if (args[0].startsWith('/')) {
                    // find /path [name] - path starts with /
                    searchPath = resolvePath(args[0], cwd);
                    if (args.length >= 2) {
                        searchName = args[1];
                    }
                } else if (args[0] === '.' || args[0].startsWith('./')) {
                    // find . [name] - current directory
                    searchPath = resolvePath(args[0], cwd);
                    if (args.length >= 2) {
                        searchName = args[1];
                    }
                } else {
                    // Single arg: treat as search name, search from root
                    if (args.length === 1) {
                        searchName = args[0];
                        searchPath = '/';
                    } else {
                        // Two args without /: treat first as path, second as name
                        searchPath = resolvePath(args[0], cwd);
                        searchName = args[1];
                    }
                }
            } else {
                searchPath = '/';
            }

            const results = [];

            function search(node, currentPath) {
                if (!node || !node.children) return;
                for (const child of node.children) {
                    const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name;
                    if (searchName ? child.name.toLowerCase().includes(searchName.toLowerCase()) : true) {
                        results.push({ path: childPath, type: child.type, name: child.name });
                    }
                    if (child.type === 'directory') {
                        search(child, childPath);
                    }
                }
            }

            search(getNode(searchPath), searchPath);
            return { results };
        }

        case 'grep': {
            if (!args[0]) {
                return { error: 'grep: missing pattern' };
            }
            const pattern = args[0];
            const searchPath = args[1] ? resolvePath(args[1], cwd) : '/';
            const results = [];

            try {
                const regex = new RegExp(pattern, 'i');

                function search(node, currentPath) {
                    if (!node || !node.children) return;
                    for (const child of node.children) {
                        const childPath = currentPath === '/' ? '/' + child.name : currentPath + '/' + child.name;
                        if (child.type === 'file' && child.content && regex.test(child.content)) {
                            results.push({
                                path: childPath,
                                name: child.name,
                                matches: child.content.split('\n').filter(line => regex.test(line))
                            });
                        }
                        if (child.type === 'directory') {
                            search(child, childPath);
                        }
                    }
                }

                search(getNode(searchPath), searchPath);
            } catch (e) {
                return { error: 'grep: invalid regular expression' };
            }

            return { results };
        }

        case 'history': {
            return { history: [] }; // History is managed client-side
        }

        case 'whoami': {
            return { user: 'root' };
        }

        default:
            return { error: `${command}: command not found` };
    }
}

// Serve the main page
app.get('/', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve terminal page
app.get('/terminal', (req, res) => {
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok', timestamp: Date.now() });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🖥️  HELLO HACKER SERVER RUNNING                         ║
    ║                                                           ║
    ║   Local:    http://localhost:${PORT}                        ║
    ║   Terminal: http://localhost:${PORT}/terminal              ║
    ║   Status:   ONLINE                                        ║
    ║                                                           ║
    ╚═════════════════════════════════════════════════════════════╝
    `);
    });
}

// Export for Vercel serverless
module.exports = app;