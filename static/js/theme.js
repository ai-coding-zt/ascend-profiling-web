/* ─── Theme Toggle (Light / Dark) ─── */

(function() {
    const STORAGE_KEY = 'ascend-profiling-theme';

    function getPreferredTheme() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);
        updateToggleIcon(theme);
        // Dispatch event for ECharts and other listeners
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }

    function updateToggleIcon(theme) {
        const btn = document.getElementById('theme-toggle');
        if (!btn) return;
        const icon = btn.querySelector('[data-lucide]');
        if (icon) {
            icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
            if (window.lucide) lucide.createIcons({ nodes: [icon] });
        }
    }

    // Apply theme on load (before paint)
    applyTheme(getPreferredTheme());

    // Expose toggle function
    window.toggleTheme = function() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark');
    };

    // Listen for OS theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
})();
