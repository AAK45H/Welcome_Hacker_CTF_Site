// ========================================
// HELLO HACKER - PREMIUM JS
// ========================================

// Matrix Rain Effect
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const charArray = chars.split('');
const fontSize = 14;
const columns = canvas.width / fontSize;
const drops = [];

for (let i = 0; i < columns; i++) {
    drops[i] = Math.random() * canvas.height / fontSize;
}

function drawMatrix() {
    ctx.fillStyle = 'rgba(10, 10, 15, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#00ff88';
    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
        const text = charArray[Math.floor(Math.random() * charArray.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Gradient effect - brighter at the head
        const gradient = ctx.createLinearGradient(x, y - 20, x, y);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0)');
        gradient.addColorStop(1, '#00ff88');
        ctx.fillStyle = gradient;

        ctx.fillText(text, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}

setInterval(drawMatrix, 50);

// Resize handler
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Floating Particles
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // Random horizontal position
        const left = Math.random() * 100;
        particle.style.left = `${left}%`;

        // Random vertical start position (0-100% from bottom)
        // We use transform to position initially, then animation takes over
        const startY = Math.random() * 100;
        particle.style.transform = `translateY(${startY}vh)`;

        // Stagger animation delays for natural look
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particle.style.animationDuration = `${15 + Math.random() * 10}s`;
        particle.style.opacity = Math.random() * 0.5 + 0.2;
        particle.style.width = `${Math.random() * 4 + 2}px`;
        particle.style.height = particle.style.width;

        // Random colors
        const colors = ['#00ff88', '#00d4ff', '#ff00ff'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.boxShadow = `0 0 ${Math.random() * 10 + 5}px ${particle.style.background}`;

        particlesContainer.appendChild(particle);
    }
}

// Initialize particles after DOM is ready to prevent stuck particles on first load
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure styles are applied
    requestAnimationFrame(() => {
        createParticles();
    });
});

// Fetch and display stats
async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        animateValue('connections', 0, data.connections, 1500);
        animateValue('packets', 0, data.packets, 1500);
        animateValue('uptime', 0, data.uptime, 1500);

        const bandwidthEl = document.getElementById('bandwidth');
        bandwidthEl.textContent = data.bandwidth;
    } catch (error) {
        console.log('Stats loading...');
    }
}

// Animate number values
function animateValue(id, start, end, duration) {
    const element = document.getElementById(id);
    if (!element) return;

    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 16);
}

// Fetch and display quote
async function fetchQuote() {
    try {
        // Add cache busting to ensure new quote each time
        const response = await fetch('/api/quote?' + new Date().getTime(), {
            cache: 'no-store'
        });
        const data = await response.json();

        const textEl = document.getElementById('quote-text');
        const authorEl = document.getElementById('quote-author');

        // Fade out
        textEl.style.opacity = '0';
        authorEl.style.opacity = '0';

        setTimeout(() => {
            textEl.textContent = data.text;
            authorEl.textContent = `— ${data.author}`;

            // Fade in
            textEl.style.opacity = '1';
            authorEl.style.opacity = '1';
        }, 300);
    } catch (error) {
        document.getElementById('quote-text').textContent = 'The system is ready. Are you?';
        document.getElementById('quote-author').textContent = '— System';
    }
}

// Expose fetchQuote globally for onclick handler
window.fetchQuote = fetchQuote;

// Add transition styles to quote elements
document.getElementById('quote-text').style.transition = 'opacity 0.3s ease';
document.getElementById('quote-author').style.transition = 'opacity 0.3s ease';

// Random glitch effect
function randomGlitch() {
    const glitchElement = document.querySelector('.glitch');
    if (!glitchElement) return;

    setInterval(() => {
        if (Math.random() > 0.95) {
            glitchElement.style.animation = 'none';
            glitchElement.offsetHeight; // Trigger reflow

            setTimeout(() => {
                glitchElement.style.animation = '';
            }, 100);
        }
    }, 100);
}

randomGlitch();

// Typing sound effect simulation (visual feedback)
function addTerminalEffects() {
    const terminal = document.querySelector('.terminal-window');
    if (!terminal) return;

    // Add subtle random flicker
    setInterval(() => {
        if (Math.random() > 0.97) {
            terminal.style.opacity = '0.95';
            setTimeout(() => {
                terminal.style.opacity = '1';
            }, 50);
        }
    }, 100);
}

addTerminalEffects();

// Command hover effects
document.querySelectorAll('.cmd-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
        const cmdName = item.querySelector('.cmd-name');
        cmdName.style.textShadow = '0 0 10px rgba(0, 212, 255, 0.8)';
    });

    item.addEventListener('mouseleave', () => {
        const cmdName = item.querySelector('.cmd-name');
        cmdName.style.textShadow = 'none';
    });
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    fetchStats();
    fetchQuote();

    // Refresh stats periodically
    setInterval(fetchStats, 5000);

    // Add random class to encrypted text chars for varied animation
    document.querySelectorAll('.encrypted-text .char').forEach((char, index) => {
        char.style.animationDelay = `${index * 0.1}s`;
    });
});

// Easter egg - Konami code
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
    konamiCode.push(e.key);
    konamiCode = konamiCode.slice(-10);

    if (konamiCode.join(',') === konamiSequence.join(',')) {
        document.body.style.animation = 'rainbow 2s linear infinite';

        const style = document.createElement('style');
        style.textContent = `
            @keyframes rainbow {
                0% { filter: hue-rotate(0deg); }
                100% { filter: hue-rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            document.body.style.animation = '';
        }, 5000);
    }
});

// Console Easter egg
console.log(`
%c╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🖥️  HELLO HACKER!!                                      ║
║                                                           ║
║   You found the console!                                  ║
║   Try the Konami code for a surprise...                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`, 'color: #00ff88; font-family: monospace;');
