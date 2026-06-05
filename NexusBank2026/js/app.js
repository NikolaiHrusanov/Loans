// ============================================
// app.js - Core Application Functionality
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize core features on all pages
    initThemeToggle();
    initMobileMenu();
    initDropdowns();
    initPasswordToggle();
    initAuthToggle();
    initRegistration();
    protectRoutes();
    initSessionTimeout();
    initLogout();
    
    // Initialize page-specific features
    initDashboardFeatures();
    initTransactions();
    initTransfer();
    
    // Initialize tooltips for tablet
    initTooltips();
    
    // Handle orientation change
    initOrientationHandler();
});

// ============================================
// THEME TOGGLE (with localStorage)
// ============================================
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Load saved theme
    const savedTheme = localStorage.getItem('nexusbank_theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }

    // Theme toggle click handler
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-theme');
        document.body.classList.toggle('light-theme');
        
        const icon = this.querySelector('i');
        const isDark = document.body.classList.contains('dark-theme');
        
        if (isDark) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            localStorage.setItem('nexusbank_theme', 'dark');
        } else {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            localStorage.setItem('nexusbank_theme', 'light');
        }
    });
}

// ============================================
// MOBILE MENU TOGGLE
// ============================================
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navRow = document.querySelector('.nav-row');
    
    if (!mobileMenuBtn || !navRow) return;
    
    // Toggle mobile menu
    mobileMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        navRow.classList.toggle('mobile-open');
        const isExpanded = navRow.classList.contains('mobile-open');
        this.setAttribute('aria-expanded', isExpanded);
        
        // Change icon based on menu state
        const icon = this.querySelector('i');
        if (isExpanded) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
            document.body.style.overflow = 'hidden';
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
            document.body.style.overflow = '';
            
            // Close all dropdowns when closing menu
            document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!navRow.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                navRow.classList.remove('mobile-open');
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
                document.body.style.overflow = '';
            }
        }
    });
    
    // Close mobile menu on window resize (if switching to desktop)
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            navRow.classList.remove('mobile-open');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            const icon = mobileMenuBtn.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
            document.body.style.overflow = '';
            
            // Close all dropdowns
            document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
                dropdown.classList.remove('active');
            });
        }
    });
    
    // Close mobile menu when clicking on a nav link
    navRow.querySelectorAll('.nav-item, .dropdown-link, .plan-link, .compare-link, .feature-link').forEach(link => {
        link.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                navRow.classList.remove('mobile-open');
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
                document.body.style.overflow = '';
            }
        });
    });
}

// ============================================
// MOBILE DROPDOWN HANDLING
// ============================================
function initDropdowns() {
    const dropdownToggles = document.querySelectorAll('.dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Only on mobile
            if (window.innerWidth <= 768) {
                const dropdown = this.closest('.nav-dropdown');
                
                // Close other dropdowns
                dropdownToggles.forEach(otherToggle => {
                    const otherDropdown = otherToggle.closest('.nav-dropdown');
                    if (otherDropdown !== dropdown && otherDropdown) {
                        otherDropdown.classList.remove('active');
                        
                        // Reset chevron rotation
                        const otherArrow = otherToggle.querySelector('.dropdown-arrow');
                        if (otherArrow) {
                            otherArrow.style.transform = '';
                        }
                    }
                });
                
                // Toggle current dropdown
                dropdown.classList.toggle('active');
                
                // Rotate chevron
                const arrow = this.querySelector('.dropdown-arrow');
                if (arrow) {
                    if (dropdown.classList.contains('active')) {
                        arrow.style.transform = 'rotate(180deg)';
                    } else {
                        arrow.style.transform = '';
                    }
                }
            }
        });
    });
    
    // Close dropdowns when clicking outside on mobile
    document.addEventListener('click', function(e) {
        if (window.innerWidth <= 768) {
            if (!e.target.closest('.nav-dropdown')) {
                document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
                    dropdown.classList.remove('active');
                    
                    // Reset all chevrons
                    dropdown.querySelectorAll('.dropdown-arrow').forEach(arrow => {
                        arrow.style.transform = '';
                    });
                });
            }
        }
    });
}

// ============================================
// TOOLTIPS FOR TABLET NAVIGATION
// ============================================
function initTooltips() {
    function setupTooltips() {
        if (window.innerWidth <= 1024 && window.innerWidth > 768) {
            document.querySelectorAll('.nav-item').forEach(item => {
                const span = item.querySelector('span');
                if (span && span.textContent && !item.classList.contains('btn-primary') && !item.classList.contains('btn-ghost')) {
                    item.setAttribute('data-tooltip', span.textContent);
                }
            });
        } else {
            // Remove tooltips on other screen sizes
            document.querySelectorAll('.nav-item').forEach(item => {
                item.removeAttribute('data-tooltip');
            });
        }
    }
    
    // Initial setup
    setupTooltips();
    
    // Update on resize
    window.addEventListener('resize', function() {
        setupTooltips();
    });
}

// ============================================
// ORIENTATION CHANGE HANDLER
// ============================================
function initOrientationHandler() {
    window.addEventListener('orientationchange', function() {
        // Close mobile menu on orientation change
        const navRow = document.querySelector('.nav-row');
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        
        if (navRow && mobileMenuBtn) {
            navRow.classList.remove('mobile-open');
            mobileMenuBtn.setAttribute('aria-expanded', 'false');
            const icon = mobileMenuBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
            document.body.style.overflow = '';
        }
        
        // Close all dropdowns
        document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
            dropdown.classList.remove('active');
            dropdown.querySelectorAll('.dropdown-arrow').forEach(arrow => {
                arrow.style.transform = '';
            });
        });
        
        // Reinitialize tooltips after orientation change
        setTimeout(initTooltips, 100);
    });
}

// ============================================
// PASSWORD VISIBILITY TOGGLE (for all pages)
// ============================================
function initPasswordToggle() {
    document.addEventListener('click', function(e) {
        if (e.target.closest('.toggle-password')) {
            const button = e.target.closest('.toggle-password');
            const input = button.parentElement.querySelector('input');
            const icon = button.querySelector('i');
            
            if (input && icon) {
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        }
    });
}

// ============================================
// AUTH TOGGLE (LOGIN / REGISTER)
// ============================================
function initAuthToggle() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');

    if (showLoginBtn && showRegisterBtn && loginForm && registerForm) {
        showLoginBtn.addEventListener('click', function() {
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            showLoginBtn.classList.add('active');
            showRegisterBtn.classList.remove('active');
        });

        showRegisterBtn.addEventListener('click', function() {
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            showRegisterBtn.classList.add('active');
            showLoginBtn.classList.remove('active');
        });
    }
}

// ============================================
// REGISTRATION – VALIDATION & SUBMIT
// ============================================
function initRegistration() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = document.getElementById('regName')?.value;
        const email = document.getElementById('regEmail')?.value;
        const password = document.getElementById('regPassword')?.value;
        const confirmPassword = document.getElementById('regConfirmPassword')?.value;
        const terms = document.getElementById('terms')?.checked;
        
        // Validation
        if (!name || !email || !password || !confirmPassword) {
            showNotification('Please fill in all fields', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showNotification('Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 8) {
            showNotification('Password must be at least 8 characters', 'error');
            return;
        }
        
        if (!terms) {
            showNotification('You must agree to the terms and conditions', 'error');
            return;
        }
        
        // Check if user already exists
        const users = JSON.parse(localStorage.getItem('nexusbank_users')) || [];
        const existingUser = users.find(u => u.email === email);
        
        if (existingUser) {
            showNotification('Email already registered', 'error');
            return;
        }
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            name: name,
            email: email,
            password: btoa(password), // Simple encoding (use proper encryption in production)
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        localStorage.setItem('nexusbank_users', JSON.stringify(users));
        
        // Create default accounts for user
        const accounts = [
            {
                id: 1,
                number: 'GB' + Math.floor(Math.random() * 10000000000),
                type: 'Current Account',
                balance: 1000,
                currency: 'GBP'
            },
            {
                id: 2,
                number: 'GB' + Math.floor(Math.random() * 10000000000),
                type: 'Savings Account',
                balance: 5000,
                currency: 'GBP'
            }
        ];
        
        localStorage.setItem(`nexusbank_accounts_${newUser.id}`, JSON.stringify(accounts));
        localStorage.setItem(`nexusbank_transactions_${newUser.id}`, JSON.stringify([]));
        
        showNotification('Registration successful! Please login.', 'success');
        
        // Switch to login form after 2 seconds
        setTimeout(() => {
            const showLoginBtn = document.getElementById('showLoginBtn');
            if (showLoginBtn) showLoginBtn.click();
            registerForm.reset();
        }, 2000);
    });
}

// ============================================
// SHOW NOTIFICATION
// ============================================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#10b981';
            break;
        case 'error':
            notification.style.backgroundColor = '#ef4444';
            break;
        default:
            notification.style.backgroundColor = '#3b82f6';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ============================================
// PROTECT ROUTES – REDIRECT IF NOT LOGGED IN
// ============================================
function protectRoutes() {
    const protectedPages = ['dashboard.html', 'accounts.html', 'transfer.html', 'transactions.html', 'savings.html', 'cards.html', 'profile.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
        const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                     JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
        
        if (!user) {
            window.location.href = 'sign-in.html';
        } else {
            // Display user name in header
            const userNameElements = document.querySelectorAll('.user-name');
            userNameElements.forEach(el => {
                el.textContent = user.name;
            });
            
            // Display user email if needed
            const userEmailElements = document.querySelectorAll('.user-email');
            userEmailElements.forEach(el => {
                el.textContent = user.email;
            });
        }
    }
}

// ============================================
// SESSION TIMEOUT – AUTO LOGOUT AFTER 30 MIN
// ============================================
function initSessionTimeout() {
    const TIMEOUT = 30 * 60 * 1000; // 30 minutes
    let timeoutId;

    function resetTimer() {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(logout, TIMEOUT);
    }

    function logout() {
        const protectedPages = ['dashboard.html', 'accounts.html', 'transfer.html', 'transactions.html', 'savings.html', 'cards.html', 'profile.html'];
        const currentPage = window.location.pathname.split('/').pop();
        
        if (protectedPages.includes(currentPage)) {
            localStorage.removeItem('nexusbank_current_user');
            sessionStorage.removeItem('nexusbank_current_user');
            
            // Show warning before redirect
            const warning = document.createElement('div');
            warning.className = 'session-warning';
            warning.textContent = 'Your session has expired. You will be redirected to login.';
            warning.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f44336;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                z-index: 9999;
                animation: slideIn 0.3s ease;
            `;
            document.body.appendChild(warning);
            
            setTimeout(() => {
                window.location.href = 'sign-in.html';
            }, 3000);
        }
    }

    // Only start timer on protected pages
    const protectedPages = ['dashboard.html', 'accounts.html', 'transfer.html', 'transactions.html', 'savings.html', 'cards.html', 'profile.html'];
    const currentPage = window.location.pathname.split('/').pop();
    
    if (protectedPages.includes(currentPage)) {
        // Events that reset the timer
        window.addEventListener('load', resetTimer);
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keypress', resetTimer);
        window.addEventListener('scroll', resetTimer);
        window.addEventListener('click', resetTimer);
        window.addEventListener('touchstart', resetTimer); // Mobile support
    }
}

// ============================================
// DASHBOARD LOGOUT BUTTON
// ============================================
function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Clear all session data
            localStorage.removeItem('nexusbank_current_user');
            sessionStorage.removeItem('nexusbank_current_user');
            
            // Show logout message
            showNotification('Logged out successfully', 'success');
            
            // Redirect to login
            setTimeout(() => {
                window.location.href = 'sign-in.html';
            }, 1000);
        });
    }
}

// ============================================
// DASHBOARD SPECIFIC FEATURES
// ============================================
function initDashboardFeatures() {
    if (!document.getElementById('dashboardContent')) return;
    
    // Load dashboard data
    loadDashboardData();
    
    // Initialize charts if any
    initDashboardCharts();
}

function loadDashboardData() {
    const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                 JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
    
    if (user) {
        // Update welcome message
        const welcomeEl = document.getElementById('welcomeMessage');
        if (welcomeEl) {
            welcomeEl.textContent = `Welcome back, ${user.name}!`;
        }
        
        // Load user's accounts data
        const accounts = JSON.parse(localStorage.getItem(`nexusbank_accounts_${user.id}`)) || [];
        updateAccountsDisplay(accounts);
        
        // Load recent transactions
        const transactions = JSON.parse(localStorage.getItem(`nexusbank_transactions_${user.id}`)) || [];
        updateRecentTransactions(transactions);
    }
}

function updateAccountsDisplay(accounts) {
    // Update accounts list in dashboard
    const accountsList = document.getElementById('accountsList');
    if (accountsList && accounts.length > 0) {
        accountsList.innerHTML = accounts.map(account => `
            <div class="account-card">
                <div class="account-type">${account.type}</div>
                <div class="account-number">${account.number}</div>
                <div class="account-balance">$${account.balance.toLocaleString()}</div>
                <div class="account-currency">${account.currency}</div>
            </div>
        `).join('');
    }
}

function updateRecentTransactions(transactions) {
    const transactionsList = document.getElementById('recentTransactions');
    if (transactionsList) {
        const recent = transactions.slice(0, 5);
        if (recent.length === 0) {
            transactionsList.innerHTML = '<p class="no-data">No recent transactions</p>';
        } else {
            transactionsList.innerHTML = recent.map(t => `
                <div class="transaction-item">
                    <div class="transaction-icon">
                        <i class="fas ${t.type === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-name">${t.description}</div>
                        <div class="transaction-date">${new Date(t.date).toLocaleDateString()}</div>
                    </div>
                    <div class="transaction-amount ${t.type}">
                        ${t.type === 'credit' ? '+' : '-'}$${t.amount}
                    </div>
                </div>
            `).join('');
        }
    }
}

function initDashboardCharts() {
    // Initialize any charts on dashboard
    const spendingChart = document.getElementById('spendingChart');
    if (spendingChart) {
        // Chart initialization code here
        // You can use Chart.js or any other library
    }
}

// ============================================
// TRANSACTIONS PAGE FEATURES
// ============================================
function initTransactions() {
    if (!document.getElementById('transactionsContent')) return;
    
    loadTransactions();
    initTransactionFilters();
}

function loadTransactions() {
    const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                 JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
    
    if (user) {
        const transactions = JSON.parse(localStorage.getItem(`nexusbank_transactions_${user.id}`)) || [];
        displayTransactions(transactions);
    }
}

function displayTransactions(transactions) {
    const transactionsList = document.getElementById('transactionsList');
    if (transactionsList) {
        if (transactions.length === 0) {
            transactionsList.innerHTML = '<p class="no-data">No transactions found.</p>';
        } else {
            transactionsList.innerHTML = transactions.map(t => `
                <div class="transaction-item">
                    <div class="transaction-icon">
                        <i class="fas ${t.type === 'credit' ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-name">${t.description}</div>
                        <div class="transaction-date">${new Date(t.date).toLocaleDateString()}</div>
                    </div>
                    <div class="transaction-amount ${t.type}">
                        ${t.type === 'credit' ? '+' : '-'}$${t.amount}
                    </div>
                </div>
            `).join('');
        }
    }
}

function initTransactionFilters() {
    const filterForm = document.getElementById('transactionFilters');
    if (filterForm) {
        filterForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // Apply filters and reload transactions
            loadTransactions();
        });
    }
}

// ============================================
// TRANSFER PAGE FEATURES
// ============================================
function initTransfer() {
    if (!document.getElementById('transferContent')) return;
    
    const transferForm = document.getElementById('transferForm');
    if (transferForm) {
        transferForm.addEventListener('submit', handleTransfer);
    }
    
    loadAccountsForTransfer();
}

function handleTransfer(e) {
    e.preventDefault();
    
    const fromAccount = document.getElementById('fromAccount')?.value;
    const toAccount = document.getElementById('toAccount')?.value;
    const amount = parseFloat(document.getElementById('amount')?.value);
    const description = document.getElementById('description')?.value;
    
    if (!fromAccount || !toAccount || !amount || amount <= 0) {
        showNotification('Please fill all fields correctly.', 'error');
        return;
    }
    
    if (fromAccount === toAccount) {
        showNotification('Cannot transfer to the same account.', 'error');
        return;
    }
    
    // Process transfer
    const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                 JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
    
    if (user) {
        // Get user's accounts
        const accounts = JSON.parse(localStorage.getItem(`nexusbank_accounts_${user.id}`)) || [];
        const sourceAccount = accounts.find(a => a.number === fromAccount);
        
        if (sourceAccount && sourceAccount.balance >= amount) {
            // Update balances
            sourceAccount.balance -= amount;
            
            // Record transaction
            const transactions = JSON.parse(localStorage.getItem(`nexusbank_transactions_${user.id}`)) || [];
            transactions.unshift({
                date: new Date().toISOString(),
                type: 'debit',
                description: `Transfer to ${toAccount}: ${description || 'No description'}`,
                amount: amount
            });
            
            // Save changes
            localStorage.setItem(`nexusbank_accounts_${user.id}`, JSON.stringify(accounts));
            localStorage.setItem(`nexusbank_transactions_${user.id}`, JSON.stringify(transactions));
            
            showNotification('Transfer completed successfully!', 'success');
            
            // Reload accounts after 2 seconds
            setTimeout(() => {
                loadAccountsForTransfer();
                loadDashboardData();
            }, 2000);
        } else {
            showNotification('Insufficient funds.', 'error');
        }
    }
}

function loadAccountsForTransfer() {
    const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                 JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
    
    if (user) {
        const accounts = JSON.parse(localStorage.getItem(`nexusbank_accounts_${user.id}`)) || [];
        const fromAccountSelect = document.getElementById('fromAccount');
        const toAccountSelect = document.getElementById('toAccount');
        
        if (fromAccountSelect) {
            fromAccountSelect.innerHTML = accounts.map(a => 
                `<option value="${a.number}">${a.type} - ${a.number} ($${a.balance})</option>`
            ).join('');
        }
        
        if (toAccountSelect) {
            toAccountSelect.innerHTML = '<option value="">Select account</option>' +
                accounts.map(a => 
                    `<option value="${a.number}">${a.type} - ${a.number}</option>`
                ).join('');
        }
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .no-data {
        text-align: center;
        color: var(--text-tertiary);
        padding: 40px;
        font-style: italic;
    }
    
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .notification.success {
        background: var(--success);
    }
    
    .notification.error {
        background: var(--error);
    }
    
    .notification.info {
        background: var(--info);
    }
    
    /* Mobile touch optimizations */
    @media (max-width: 768px) {
        .nav-item,
        .dropdown-link,
        .plan-link,
        .compare-link,
        .feature-link,
        .btn {
            -webkit-tap-highlight-color: rgba(99, 102, 241, 0.3);
        }
        
        .notification {
            left: 20px;
            right: 20px;
            width: auto;
            text-align: center;
        }
    }
`;

document.head.appendChild(style);