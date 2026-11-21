/**
 * Main App Entry Point
 * Initializes shared components (header, footer) and auth
 */

import { initAuth, onAuthChange, isAuthenticated, isProvider, isSeeker, getUserProfile, showToast } from './auth.js';

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  await loadSharedComponents();
  setupGlobalListeners();
});

/**
 * Load header and footer via fetch
 */
async function loadSharedComponents() {
  try {
    const [headerRes, footerRes] = await Promise.all([
      fetch('/header.html'),
      fetch('/footer.html')
    ]);

    const headerHtml = await headerRes.text();
    const footerHtml = await footerRes.text();

    document.getElementById('site-header').innerHTML = headerHtml;
    document.getElementById('site-footer').innerHTML = footerHtml;

    // Initialize header interactions after injection
    initHeader();
    updateAuthUI();
  } catch (err) {
    console.error('Failed to load shared components:', err);
  }
}

/**
 * Initialize header interactions (dropdown, mobile menu)
 */
function initHeader() {
  // User menu dropdown (handled by CSS hover, but add keyboard support)
  const userMenu = document.querySelector('.user-menu');
  if (userMenu) {
    const trigger = userMenu.querySelector('.user-menu-trigger');
    const dropdown = userMenu.querySelector('.user-menu-dropdown');

    trigger?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        trigger.click();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown) {
        trigger?.focus();
      }
    });
  }

  // Mobile menu toggle
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const headerNav = document.querySelector('.header-nav');
  if (mobileMenuBtn && headerNav) {
    mobileMenuBtn.addEventListener('click', () => {
      headerNav.classList.toggle('mobile-open');
      mobileMenuBtn.setAttribute('aria-expanded', headerNav.classList.contains('mobile-open'));
    });
  }
}

/**
 * Update UI based on auth state
 */
function updateAuthUI() {
  const authButtons = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');
  const userName = document.querySelector('.user-name');
  const userAvatar = document.querySelector('.user-avatar');

  if (isAuthenticated()) {
    const profile = getUserProfile();
    if (authButtons) authButtons.style.display = 'none';
    if (userMenu) userMenu.style.display = 'block';
    if (userName) userName.textContent = profile?.full_name || 'ผู้ใช้';
    if (userAvatar) userAvatar.textContent = (profile?.full_name || 'U')[0].toUpperCase();
  } else {
    if (authButtons) authButtons.style.display = 'flex';
    if (userMenu) userMenu.style.display = 'none';
  }
}

/**
 * Listen for auth changes to update UI
 */
onAuthChange(() => {
  updateAuthUI();
});

/**
 * Setup global event listeners
 */
function setupGlobalListeners() {
  // Handle logout buttons
  document.addEventListener('click', async (e) => {
    const logoutBtn = e.target.closest('[data-action="logout"]');
    if (logoutBtn) {
      e.preventDefault();
      await handleLogout();
    }
  });

  // Handle links that need auth
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-auth-required]');
    if (link && !isAuthenticated()) {
      e.preventDefault();
      showToast('กรุณาเข้าสู่ระบบก่อน', 'warning');
      setTimeout(() => {
        window.location.href = '/pages/login.html?redirect=' + encodeURIComponent(window.location.href);
      }, 1500);
    }
  });
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    const { signOut } = await import('./auth.js');
    await signOut();
    showToast('ออกจากระบบเรียบร้อย', 'success');
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    console.error('Logout error:', err);
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

/**
 * Format date for display (Thai)
 */
export function formatDisplayDate(dateString) {
  const date = new Date(dateString);
  const beYear = date.getFullYear() + 543;
  const months = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${beYear}`;
}

/**
 * Format relative time (Thai)
 */
export function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return formatDisplayDate(dateString);
}