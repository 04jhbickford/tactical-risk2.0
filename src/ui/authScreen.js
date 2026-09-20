// Authentication Screen UI for Tactical Risk multiplayer

import { getAuthManager } from '../multiplayer/auth.js';
import { shouldShowSignInForm } from '../multiplayer/presencePolicy.js';

export class AuthScreen {
  constructor(onComplete) {
    this.onComplete = onComplete;
    this.authManager = getAuthManager();
    this.el = null;
    this.mode = 'login'; // 'restoring', 'login', 'signup', 'phone', 'verify'
    this.phoneNumber = '';
    this.isLoading = false;
  }

  show() {
    if (!this.el) {
      this._create();
    }
    this.el.classList.remove('hidden');
    if (this.authManager.isLoggedIn()) {
      this.hide();
      if (this.onComplete) this.onComplete(this.authManager.getUser());
      return;
    }
    if (!shouldShowSignInForm({
      authReady: this.authManager.isAuthReady(),
      userPresent: this.authManager.isLoggedIn(),
    })) {
      this.mode = 'restoring';
      this._render();
      this._restoreThenContinue();
      return;
    }
    if (this.mode === 'restoring') this.mode = 'login';
    this._render();
  }

  async _restoreThenContinue() {
    await this.authManager.whenReady();
    if (this.authManager.isLoggedIn()) {
      this.hide();
      if (this.onComplete) this.onComplete(this.authManager.getUser());
      return;
    }
    this.mode = 'login';
    this._render();
  }

  hide() {
    if (this.el) {
      this.el.classList.add('hidden');
    }
  }

  destroy() {
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'auth-screen';
    this.el.className = 'lobby-overlay modern';
    document.body.appendChild(this.el);
  }

  _render() {
    const html = `
      <div class="lobby-container modern">
        <div class="lobby-bg-pattern"></div>
        <div class="lobby-content-wrapper">
          <div class="auth-container">
            <div class="lobby-brand">
              <h1 class="lobby-logo">Tactical Risk</h1>
              <p class="lobby-tagline">${this.mode === 'restoring' ? 'Restoring your session' : 'Sign in to play online'}</p>
            </div>

            ${this.mode === 'restoring' ? '' : `
            <div class="auth-tabs modern">
              <button class="auth-tab ${this.mode === 'login' ? 'active' : ''}" data-mode="login">Sign In</button>
              <button class="auth-tab ${this.mode === 'signup' ? 'active' : ''}" data-mode="signup">Sign Up</button>
              <button class="auth-tab ${this.mode === 'phone' || this.mode === 'verify' ? 'active' : ''}" data-mode="phone">Phone</button>
            </div>
            `}

            <div class="auth-form-container">
              ${this._renderForm()}
            </div>

            <button class="auth-back-btn modern" data-action="back">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _renderForm() {
    if (this.mode === 'restoring') {
      return `
        <p class="mp-no-games">Restoring your session…</p>
        <p class="mp-no-games-hint">You were signed in. The match is still there.</p>
      `;
    }
    if (this.mode === 'login') {
      return `
        <form class="auth-form modern" data-form="login">
          <div class="mp-field">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" placeholder="your@email.com" required class="modern-input">
          </div>
          <div class="mp-field">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" placeholder="Password" required class="modern-input">
          </div>
          <div class="mp-error hidden" id="login-error"></div>
          <button type="submit" class="mp-primary-btn" ${this.isLoading ? 'disabled' : ''}>
            ${this.isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      `;
    }

    if (this.mode === 'signup') {
      return `
        <form class="auth-form modern" data-form="signup">
          <div class="mp-field">
            <label for="signup-name">Display Name</label>
            <input type="text" id="signup-name" placeholder="Your name" maxlength="20" required class="modern-input">
          </div>
          <div class="mp-field">
            <label for="signup-email">Email</label>
            <input type="email" id="signup-email" placeholder="your@email.com" required class="modern-input">
          </div>
          <div class="mp-field">
            <label for="signup-password">Password</label>
            <input type="password" id="signup-password" placeholder="Min 6 characters" minlength="6" required class="modern-input">
          </div>
          <div class="mp-error hidden" id="signup-error"></div>
          <button type="submit" class="mp-primary-btn" ${this.isLoading ? 'disabled' : ''}>
            ${this.isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      `;
    }

    if (this.mode === 'phone') {
      return `
        <form class="auth-form modern" data-form="phone">
          <div class="mp-field">
            <label for="phone-number">Phone Number</label>
            <input type="tel" id="phone-number" placeholder="+1234567890" required class="modern-input">
            <span class="auth-hint">Include country code (e.g., +1 for US)</span>
          </div>
          <div class="mp-error hidden" id="phone-error"></div>
          <button type="submit" id="phone-submit-btn" class="mp-primary-btn" ${this.isLoading ? 'disabled' : ''}>
            ${this.isLoading ? 'Sending code...' : 'Send Verification Code'}
          </button>
        </form>
      `;
    }

    if (this.mode === 'verify') {
      return `
        <form class="auth-form modern" data-form="verify">
          <p class="auth-verify-info">Enter the code sent to <strong>${this.phoneNumber}</strong></p>
          <div class="mp-field">
            <label for="verify-code">Verification Code</label>
            <input type="text" id="verify-code" placeholder="123456" maxlength="6" required class="modern-input code-input">
          </div>
          <div class="mp-error hidden" id="verify-error"></div>
          <button type="submit" class="mp-primary-btn" ${this.isLoading ? 'disabled' : ''}>
            ${this.isLoading ? 'Verifying...' : 'Verify Code'}
          </button>
          <button type="button" class="auth-resend-btn modern" data-action="resend">
            Didn't receive code? Resend
          </button>
        </form>
      `;
    }

    return '';
  }

  _bindEvents() {
    // Tab switching
    this.el.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.mode = tab.dataset.mode;
        this._render();
      });
    });

    // Back button
    this.el.querySelector('.auth-back-btn')?.addEventListener('click', () => {
      this.hide();
      if (this.onComplete) {
        this.onComplete(null); // Cancelled
      }
    });

    // Login form
    this.el.querySelector('[data-form="login"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleLogin(e.target);
    });

    // Signup form
    this.el.querySelector('[data-form="signup"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleSignup(e.target);
    });

    // Phone form
    this.el.querySelector('[data-form="phone"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handlePhoneSend(e.target);
    });

    // Verify form
    this.el.querySelector('[data-form="verify"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handlePhoneVerify(e.target);
    });

    // Resend button
    this.el.querySelector('[data-action="resend"]')?.addEventListener('click', () => {
      this.mode = 'phone';
      this._render();
    });
  }

  async _handleLogin(form) {
    const email = form.querySelector('#login-email').value;
    const password = form.querySelector('#login-password').value;
    const errorEl = form.querySelector('#login-error');

    this.isLoading = true;
    this._render();

    const result = await this.authManager.signInWithEmail(email, password);

    this.isLoading = false;

    if (result.success) {
      this.hide();
      if (this.onComplete) {
        this.onComplete(this.authManager.getUser());
      }
    } else {
      this._render();
      const newErrorEl = this.el.querySelector('#login-error');
      if (newErrorEl) {
        newErrorEl.textContent = result.error;
        newErrorEl.classList.remove('hidden');
      }
    }
  }

  async _handleSignup(form) {
    const name = form.querySelector('#signup-name').value;
    const email = form.querySelector('#signup-email').value;
    const password = form.querySelector('#signup-password').value;
    const errorEl = form.querySelector('#signup-error');

    this.isLoading = true;
    this._render();

    const result = await this.authManager.signUpWithEmail(email, password, name);

    this.isLoading = false;

    if (result.success) {
      this.hide();
      if (this.onComplete) {
        this.onComplete(this.authManager.getUser());
      }
    } else {
      this._render();
      const newErrorEl = this.el.querySelector('#signup-error');
      if (newErrorEl) {
        newErrorEl.textContent = result.error;
        newErrorEl.classList.remove('hidden');
      }
    }
  }

  async _handlePhoneSend(form) {
    const phoneNumber = form.querySelector('#phone-number').value;
    const errorEl = form.querySelector('#phone-error');

    this.isLoading = true;
    this.phoneNumber = phoneNumber;
    this._render();

    const result = await this.authManager.sendPhoneVerification(phoneNumber, 'phone-submit-btn');

    this.isLoading = false;

    if (result.success) {
      this.mode = 'verify';
      this._render();
    } else {
      this._render();
      const newErrorEl = this.el.querySelector('#phone-error');
      if (newErrorEl) {
        newErrorEl.textContent = result.error;
        newErrorEl.classList.remove('hidden');
      }
    }
  }

  async _handlePhoneVerify(form) {
    const code = form.querySelector('#verify-code').value;
    const errorEl = form.querySelector('#verify-error');

    this.isLoading = true;
    this._render();

    const result = await this.authManager.verifyPhoneCode(code);

    this.isLoading = false;

    if (result.success) {
      this.hide();
      if (this.onComplete) {
        this.onComplete(this.authManager.getUser());
      }
    } else {
      this._render();
      const newErrorEl = this.el.querySelector('#verify-error');
      if (newErrorEl) {
        newErrorEl.textContent = result.error;
        newErrorEl.classList.remove('hidden');
      }
    }
  }
}
