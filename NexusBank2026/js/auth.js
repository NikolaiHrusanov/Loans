// ============================================
// auth.js - Login & Authentication Specific
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Initialize login-specific features only on login page
    if (document.getElementById('loginForm')) {
        initLogin();
        initForgotPassword();
    }
});

// ============================================
// LOGIN – AUTHENTICATION & REMEMBER ME
// ============================================
// ============================================
// LOGIN – SUPABASE AUTHENTICATION
// ============================================
function initLogin() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const rememberCheck = document.querySelector('#loginForm .checkbox input[type="checkbox"]');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loginError = document.getElementById('loginError');

    // Clear errors on input
    if (emailInput) {
        emailInput.addEventListener('input', () => {
            if (loginError) loginError.style.display = 'none';
        });
    }
    
    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            if (loginError) loginError.style.display = 'none';
        });
    }

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Basic validation
        if (!email || !password) {
            if (loginError) {
                loginError.textContent = 'Please enter both email and password.';
                loginError.style.display = 'block';
            }
            return;
        }

        // Show loading
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        // Sign in with Supabase
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            // Hide loading
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            
            // Show error
            if (loginError) {
                loginError.textContent = error.message || 'Invalid email or password.';
                loginError.style.display = 'block';
            }
            
            // Shake animation
            loginForm.classList.add('shake');
            setTimeout(() => loginForm.classList.remove('shake'), 500);
            return;
        }

        // Success! Fetch user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        // Store user info locally for quick access
        const userSession = {
            id: data.user.id,
            name: profile?.full_name || data.user.user_metadata?.full_name || 'User',
            email: data.user.email,
            loginTime: new Date().toISOString()
        };

        // Handle "Remember Me"
        if (rememberCheck && rememberCheck.checked) {
            localStorage.setItem('nexusbank_current_user', JSON.stringify(userSession));
            sessionStorage.removeItem('nexusbank_current_user');
        } else {
            sessionStorage.setItem('nexusbank_current_user', JSON.stringify(userSession));
            localStorage.removeItem('nexusbank_current_user');
        }

        window.location.href = 'accounts.html';
    });
}

// Update the check for logged-in users
(function checkLoggedIn() {
    if (window.location.pathname.includes('login.html')) {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                window.location.href = 'accounts.html';
            }
        });
    }
})();

// ============================================
// FORGOT PASSWORD – SIMULATION
// ============================================
function initForgotPassword() {
    const forgotLink = document.querySelector('.forgot-link');
    if (!forgotLink) return;

    forgotLink.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Create a modal dialog instead of prompt for better UX
        const email = prompt('Enter your email address to reset your password:');
        
        if (email) {
            if (email.includes('@') && email.includes('.')) {
                // Check if email exists in our "database"
                const users = JSON.parse(localStorage.getItem('nexusbank_users')) || [];
                const userExists = users.some(u => u.email === email);
                
                if (userExists) {
                    // Generate a reset token and store (demo)
                    const token = Math.random().toString(36).substr(2, 10);
                    const resetRequests = JSON.parse(localStorage.getItem('nexusbank_reset_tokens')) || [];
                    
                    // Remove any existing tokens for this email
                    const filteredRequests = resetRequests.filter(req => req.email !== email);
                    
                    // Add new token
                    filteredRequests.push({ 
                        email, 
                        token, 
                        expires: Date.now() + 3600000 // 1 hour
                    });
                    
                    localStorage.setItem('nexusbank_reset_tokens', JSON.stringify(filteredRequests));
                    
                    // In a real app, you'd send an email here
                    alert(`✅ Password reset link sent to ${email}\n\nDemo Token: ${token}\n\n(In a real app, this would be sent via email)`);
                } else {
                    alert('❌ No account found with this email address.');
                }
            } else {
                alert('❌ Please enter a valid email address.');
            }
        }
    });
}

// ============================================
// CHECK IF USER IS ALREADY LOGGED IN
// ============================================
(function checkLoggedIn() {
    // Only run on login page
    if (window.location.pathname.includes('login.html')) {
        const user = JSON.parse(localStorage.getItem('nexusbank_current_user')) ||
                     JSON.parse(sessionStorage.getItem('nexusbank_current_user'));
        
        // If user is already logged in, redirect to dashboard
        if (user) {
            window.location.href = 'accounts.html';
        }
    }
})();

// Add CSS animation for form shake
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
    .shake {
        animation: shake 0.5s ease-in-out;
    }
`;
document.head.appendChild(style);