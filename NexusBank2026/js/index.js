// ============================================
// index.js - Homepage Specific Features with Mobile Support
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    'use strict';
    
    // Only run on homepage
    if (!document.querySelector('.hero')) return;
    
    // ===== MOBILE MENU FUNCTIONALITY =====
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navRow = document.querySelector('.nav-row');
    const floatingNav = document.querySelector('.floating-nav');
    
    if (mobileMenuBtn && navRow) {
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
                // Prevent body scroll when menu is open
                document.body.style.overflow = 'hidden';
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
                document.body.style.overflow = '';
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
    
    // ===== MOBILE DROPDOWN HANDLING =====
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
    
    // ===== HERO SECTION PARALLAX (Optimized for mobile) =====
    const hero = document.querySelector('.hero');
    if (hero) {
        let ticking = false;
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    // Only apply parallax on larger screens (reduces mobile jank)
                    if (window.innerWidth > 768) {
                        const scrolled = window.pageYOffset;
                        hero.style.backgroundPosition = `center ${scrolled * 0.5}px`;
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }
    
    // ===== DASHBOARD PREVIEW 3D EFFECT (Disabled on mobile) =====
    const dashboardPreview = document.querySelector('.dashboard-preview');
    if (dashboardPreview && window.innerWidth > 768) {
        // 3D tilt effect on mouse move
        dashboardPreview.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(20px)`;
        });
        
        // Reset on mouse leave
        dashboardPreview.addEventListener('mouseleave', function() {
            this.style.transform = 'perspective(1000px) rotateY(-10deg) translateZ(0)';
        });
    } else if (dashboardPreview) {
        // Simpler transform for mobile
        dashboardPreview.style.transform = 'perspective(1000px) rotateY(-5deg) translateZ(0)';
    }
    
    // ===== FEATURE CARDS ANIMATION (Optimized for mobile) =====
    const featureCards = document.querySelectorAll('.feature-card');
    
    if (featureCards.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                    
                    const index = Array.from(featureCards).indexOf(entry.target);
                    entry.target.style.transitionDelay = `${index * 0.1}s`;
                    
                    // Unobserve after animation to save resources
                    observer.unobserve(entry.target);
                }
            });
        }, { 
            threshold: window.innerWidth <= 768 ? 0.1 : 0.2, // Lower threshold on mobile
            rootMargin: '0px'
        });
        
        featureCards.forEach(card => {
            // Set initial styles
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            
            // For mobile, don't use delay to keep it simple
            if (window.innerWidth <= 768) {
                card.style.transitionDelay = '0s';
            }
            
            observer.observe(card);
        });
    }
    
    // ===== STATS COUNTER ANIMATION (Optimized for mobile) =====
    const stats = document.querySelectorAll('.stat-number');
    
    if (stats.length > 0) {
        // Use a simpler animation on mobile for performance
        const isMobile = window.innerWidth <= 768;
        
        const statsObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (isMobile) {
                        // Just show the final number on mobile
                        entry.target.style.opacity = '1';
                    } else {
                        animateCounter(entry.target);
                    }
                    statsObserver.unobserve(entry.target);
                }
            });
        }, { threshold: isMobile ? 0.3 : 0.5 });
        
        stats.forEach(stat => {
            // Set initial state
            stat.style.opacity = '0';
            stat.style.transition = 'opacity 0.3s ease';
            statsObserver.observe(stat);
        });
        
        function animateCounter(element) {
            const target = element.innerText;
            const numericValue = parseFloat(target.replace(/[^0-9.]/g, ''));
            const suffix = target.replace(/[0-9.]/g, '');
            
            if (isNaN(numericValue)) return;
            
            let current = 0;
            const increment = numericValue / (isMobile ? 30 : 50); // Faster animation on mobile
            
            const counter = setInterval(() => {
                current += increment;
                
                if (current >= numericValue) {
                    element.innerText = target;
                    element.style.opacity = '1';
                    clearInterval(counter);
                } else {
                    if (Number.isInteger(numericValue)) {
                        element.innerText = Math.floor(current) + suffix;
                    } else {
                        element.innerText = current.toFixed(1) + suffix;
                    }
                    element.style.opacity = '1';
                }
            }, isMobile ? 20 : 30); // Shorter interval on mobile
        }
    }
    
    // ===== PHONE MOCKUP INTERACTION (Simplified for mobile) =====
    const phoneMockup = document.querySelector('.phone-mockup');
    if (phoneMockup) {
        phoneMockup.addEventListener('click', function() {
            this.style.transform = 'translateY(-10px) rotate(1deg)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    }
    
    // ===== SMOOTH SCROLL FOR ANCHOR LINKS (Optimized for mobile) =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href !== '#' && href.length > 1) {
                e.preventDefault();
                const target = document.querySelector(href);
                
                if (target) {
                    const navHeight = document.querySelector('.floating-nav')?.offsetHeight || 70;
                    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: window.innerWidth <= 768 ? 'auto' : 'smooth' // No smooth scroll on mobile for better performance
                    });
                }
            }
        });
    });
    
    // ===== ACTIVE NAVIGATION ON SCROLL (Optimized) =====
    const sections = document.querySelectorAll('section[id]');
    const navItems = document.querySelectorAll('.nav-item');
    
    if (sections.length > 0 && navItems.length > 0) {
        let ticking = false;
        
        window.addEventListener('scroll', function() {
            if (!ticking) {
                window.requestAnimationFrame(function() {
                    let current = '';
                    const scrollPosition = window.scrollY + 120;
                    
                    sections.forEach(section => {
                        const sectionTop = section.offsetTop;
                        const sectionHeight = section.offsetHeight;
                        
                        if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                            current = section.getAttribute('id');
                        }
                    });
                    
                    navItems.forEach(item => {
                        item.classList.remove('active');
                        const href = item.getAttribute('href');
                        if (href && href.includes(current) && href !== '#') {
                            item.classList.add('active');
                        }
                        
                        if (!current && item.getAttribute('href') === 'index.html') {
                            item.classList.add('active');
                        }
                    });
                    
                    ticking = false;
                });
                ticking = true;
            }
        });
    }
    
    // ===== TOOLTIP FOR NAVIGATION (Tablet only) =====
    function setupTooltips() {
        if (window.innerWidth <= 1024 && window.innerWidth > 768) {
            document.querySelectorAll('.nav-item').forEach(item => {
                const span = item.querySelector('span');
                if (span && span.textContent) {
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
    
    // ===== TOUCH OPTIMIZATIONS FOR MOBILE =====
    if (window.innerWidth <= 768) {
        // Increase touch target sizes for better mobile experience
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .nav-item,
                .dropdown-link,
                .plan-link,
                .compare-link,
                .feature-link {
                    min-height: 44px;
                    padding: 12px 16px !important;
                }
                
                .dropdown-toggle {
                    min-height: 44px;
                }
                
                .mobile-menu-btn {
                    min-width: 44px;
                    min-height: 44px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // ===== PAGE LOAD ANIMATIONS (Optimized) =====
    // Add a small delay before showing animations to avoid jank
    setTimeout(() => {
        document.body.classList.add('animations-ready');
    }, 100);
    
    // ===== ORIENTATION CHANGE HANDLING =====
    window.addEventListener('orientationchange', function() {
        // Close mobile menu on orientation change
        if (navRow) {
            navRow.classList.remove('mobile-open');
            if (mobileMenuBtn) {
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
                const icon = mobileMenuBtn.querySelector('i');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
            document.body.style.overflow = '';
        }
        
        // Close all dropdowns
        document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
            dropdown.classList.remove('active');
        });
    });
    
    // ===== SCROLL-LOCK FOR MOBILE MENU =====
    // Prevent body scroll when menu is open
    if (navRow && mobileMenuBtn) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === 'class') {
                    if (navRow.classList.contains('mobile-open')) {
                        document.body.style.overflow = 'hidden';
                    } else {
                        document.body.style.overflow = '';
                    }
                }
            });
        });
        
        observer.observe(navRow, { attributes: true });
    }
});

// Add tooltip styles
const style = document.createElement('style');
style.textContent = `
    @media (min-width: 769px) and (max-width: 1024px) {
        .nav-item[data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: -30px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--surface-elevated);
            color: var(--text-primary);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            border: 1px solid var(--border-light);
            box-shadow: var(--shadow-sm);
            z-index: 1000;
            pointer-events: none;
            animation: fadeIn 0.2s ease;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateX(-50%) translateY(-5px);
            }
            to {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        }
    }
    
    /* Mobile menu animations */
    @media (max-width: 768px) {
        .nav-row.mobile-open {
            animation: slideDown 0.3s ease forwards;
        }
        
        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .nav-dropdown.active .dropdown-menu {
            animation: expandMenu 0.3s ease forwards;
        }
        
        @keyframes expandMenu {
            from {
                opacity: 0;
                transform: scaleY(0.8);
                transform-origin: top;
            }
            to {
                opacity: 1;
                transform: scaleY(1);
                transform-origin: top;
            }
        }
        
        /* Improve tap highlight */
        .nav-item,
        .dropdown-link,
        .plan-link,
        .compare-link,
        .feature-link,
        .btn {
            -webkit-tap-highlight-color: rgba(99, 102, 241, 0.3);
        }
        
        /* Disable hover effects on mobile */
        .nav-item:hover,
        .dropdown-link:hover,
        .feature-card:hover {
            transform: none !important;
        }
        
        /* Loading animation for mobile */
        .nav-row.mobile-open::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(3px);
            z-index: -1;
            animation: fadeInOverlay 0.3s ease;
        }
        
        @keyframes fadeInOverlay {
            from { opacity: 0; }
            to { opacity: 1; }
        }
    }
`;

document.head.appendChild(style);