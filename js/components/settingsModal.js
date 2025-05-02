// ===== FILE: js/components/settingsModal.js =====
/*
 * One-stop, self-contained Settings modal component.
 *  • Keeps localStorage persistence.
 *  • Removes legacy *_old inputs, duplicate listeners, dead code.
 *  • All DOM look-ups are deferred until DOMContentLoaded.
 *  • Safer rendering (no innerHTML with user input).
 */

import * as state from '../state.js';
import { showNotification }          from './notification.js';
import { updateInputUIForModel }     from './chatInput.js';
import { updateHeaderModelSelect }   from './header.js';
import { signOut, onAuthStateChange }from '../authService.js';
import { showAuthModal }             from './authModal.js';

/* ---------- Helpers ---------------------------------------------------- */

const KEY_PATTERNS = {
  openai : /^sk-[A-Za-z0-9]{32,100}$/,
  gemini : /^[A-Za-z0-9-_]{39}$/,
  xai    : /^[A-Za-z0-9-_]{64}$/
};

function isValidKey(value = '', provider) {
  if (!value) return true;                         // empty = optional
  return KEY_PATTERNS[provider]?.test(value) ?? true;
}

/* ---------- SettingsModal class ---------------------------------------- */

class SettingsModal {
  constructor() {
    /* DOM nodes – filled in `this.cacheDom()` */
    this.modal                 = null;
    this.tabs                  = null;
    this.tabContents           = null;
    this.apiKeyInputs          = null;
    this.apiKeyToggles         = null;
    this.apiKeyIndicators      = null;

    this.apiKeyOpenAIInput     = null;
    this.geminiApiKeyInput     = null;
    this.xaiApiKeyInput        = null;

    this.modelSelect           = null;
    this.ttsInstructionsInput  = null;
    this.ttsVoiceSelect        = null;

    this.saveBtn               = null;
    this.closeBtn              = null;

    /* public */
    this.open   = this.open  .bind(this);
    this.close  = this.close .bind(this);

    /* private binds */
    this.#handleTabClick       = this.#handleTabClick.bind(this);
    this.#handleOverlayClick   = this.#handleOverlayClick.bind(this);
    this.#handleToggleClick    = this.#handleToggleClick.bind(this);
    this.#handleSaveClick      = this.#handleSaveClick.bind(this);
  }

  /* -------------------------------------------------------------------- */
  /*  Initialisation                                                      */
  /* -------------------------------------------------------------------- */
  init() {
    this.cacheDom();
    this.attachEvents();
    this.populateUserInfo();             // initial render
    return this;                         // fluent
  }

  /* querySelector look-ups (run *after* DOM is ready) */
  cacheDom() {
    this.modal                = document.getElementById('settingsModal');

    this.tabs                 = [...this.modal.querySelectorAll('.settings-tab')];
    this.tabContents          = [...this.modal.querySelectorAll('.settings-tab-content')];

    this.apiKeyInputs         = [...this.modal.querySelectorAll('.api-key-input')];
    this.apiKeyToggles        = [...this.modal.querySelectorAll('.api-key-toggle')];

    /* individual fields */
    this.apiKeyOpenAIInput    = this.modal.querySelector('#apiKey');
    this.geminiApiKeyInput    = this.modal.querySelector('#geminiApiKey');
    this.xaiApiKeyInput       = this.modal.querySelector('#xaiApiKey');

    this.modelSelect          = this.modal.querySelector('#modelSelect');
    this.ttsInstructionsInput = this.modal.querySelector('#ttsInstructionsInput');
    this.ttsVoiceSelect       = this.modal.querySelector('#ttsVoiceSelect');

    this.saveBtn              = this.modal.querySelector('#saveSettingsBtn');
    this.closeBtn             = this.modal.querySelector('#closeModalBtn');
  }

  attachEvents() {
    /* tab nav */
    this.tabs.forEach(tab => tab.addEventListener('click', this.#handleTabClick));

    /* key show / hide */
    this.apiKeyToggles.forEach(t => t.addEventListener('click', this.#handleToggleClick));

    /* live validation */
    this.apiKeyInputs.forEach(input => {
      input.addEventListener('input',  () => this.#validate(input));
      input.addEventListener('blur',   () => this.#validate(input));
    });

    /* save / close / overlay */
    this.saveBtn .addEventListener('click', this.#handleSaveClick);
    this.closeBtn.addEventListener('click', this.close);
    this.modal   .addEventListener('click', this.#handleOverlayClick);

    /* auth state changes update account area */
    onAuthStateChange(() => {
      if (this.modal.classList.contains('visible')) this.populateUserInfo();
    });
  }

  /* -------------------------------------------------------------------- */
  /*  Modal open / close                                                  */
  /* -------------------------------------------------------------------- */
  open() {
    this.#fillForm(state.loadSettings());
    this.#switchTab('api-keys');
    this.modal.classList.add('visible');
    this.apiKeyInputs.forEach(this.#validate.bind(this)); // initial validation
  }

  close() {
    this.modal.classList.remove('visible');
  }

  /* -------------------------------------------------------------------- */
  /*  Internal helpers                                                    */
  /* -------------------------------------------------------------------- */
  #switchTab(id) {
    this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    this.tabContents.forEach(c => c.style.display = c.id === id ? 'block' : 'none');
  }

  #validate(input) {
    const provider   = input.dataset.provider;
    const container  = input.closest('.api-key-input-container');
    const indicator  = container.querySelector('.api-key-validation-indicator');

    const ok = isValidKey(input.value, provider);

    indicator.textContent = input.value ? (ok ? '✓' : '✕') : '';
    indicator.classList.toggle('valid',  ok && input.value);
    indicator.classList.toggle('error', !ok && input.value);
    input     .classList.toggle('error', !ok && input.value);
  }

  #saveToLocalStorage(settingsObj) {
    localStorage.setItem('settings', JSON.stringify(settingsObj));
  }

  #fillForm({ apiKey = '', geminiApiKey = '', xaiApiKey = '', model = 'gpt-4o',
              ttsInstructions = '', ttsVoice = 'alloy' }) {
    this.apiKeyOpenAIInput.value = apiKey;
    this.geminiApiKeyInput.value = geminiApiKey;
    this.xaiApiKeyInput.value    = xaiApiKey;

    this.modelSelect.value          = model;
    this.ttsVoiceSelect.value       = ttsVoice;
    this.ttsInstructionsInput.value = ttsInstructions;
  }

  /* -------------------------------------------------------------------- */
  /*  User info / Auth section                                            */
  /* -------------------------------------------------------------------- */
  populateUserInfo() {
    const container = this.modal.querySelector('#userInfoSection');
    if (!container) return;

    const user = state.getCurrentUserState();
    container.replaceChildren(); // clear

    const h3 = document.createElement('h3');
    h3.textContent = 'Account';
    container.appendChild(h3);

    if (user) {
      /* signed-in markup */
      const wrapper  = document.createElement('div');
      wrapper.className = 'user-info';
      wrapper.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:8px';

      const emailDiv = document.createElement('div');
      emailDiv.className   = 'user-email';
      emailDiv.textContent = `Signed in as: ${user.email}`;

      const logoutBtn = document.createElement('button');
      logoutBtn.id = 'logoutFromSettings';
      logoutBtn.className = 'secondary-button';
      logoutBtn.textContent = 'Sign Out';

      logoutBtn.addEventListener('click', async () => {
        try {
          await signOut();
          showNotification('Signed out successfully', 'success');
          this.populateUserInfo();
          this.close();
        } catch (err) {
          showNotification('Error signing out: ' + err.message, 'error');
        }
      });

      wrapper.append(emailDiv, logoutBtn);
      container.appendChild(wrapper);
    } else {
      /* not signed-in markup */
      const wrapper  = document.createElement('div');
      wrapper.style.marginTop = '8px';

      const statusP = document.createElement('p');
      statusP.textContent = 'Not signed in';
      statusP.style.margin = '0 0 12px 0';

      const loginBtn = document.createElement('button');
      loginBtn.id = 'loginFromSettings';
      loginBtn.className = 'primary-button';
      loginBtn.textContent = 'Sign In';

      loginBtn.addEventListener('click', () => {
        this.close();
        showAuthModal();
      });

      wrapper.append(statusP, loginBtn);
      container.appendChild(wrapper);
    }
  }

  /* -------------------------------------------------------------------- */
  /*  Event handlers                                                      */
  /* -------------------------------------------------------------------- */
  #handleTabClick(e) {
    const tab = e.target.closest('.settings-tab');
    if (tab) this.#switchTab(tab.dataset.tab);
  }

  #handleOverlayClick(e) {
    if (e.target === this.modal) this.close();
  }

  #handleToggleClick(e) {
    const container = e.currentTarget.closest('.api-key-input-container');
    const input     = container.querySelector('.api-key-input');
    const icon      = e.currentTarget.querySelector('i');

    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    icon.textContent = show ? 'visibility_off' : 'visibility';
  }

  #handleSaveClick() {
    /* gather data */
    const settings = {
      apiKey         : this.apiKeyOpenAIInput.value.trim(),
      geminiApiKey   : this.geminiApiKeyInput.value.trim(),
      xaiApiKey      : this.xaiApiKeyInput.value.trim(),
      model          : this.modelSelect.value,
      ttsInstructions: this.ttsInstructionsInput.value.trim(),
      ttsVoice       : this.ttsVoiceSelect.value
    };

    /* quick validation gate */
    if (!isValidKey(settings.apiKey, 'openai') ||
        !isValidKey(settings.geminiApiKey, 'gemini') ||
        !isValidKey(settings.xaiApiKey, 'xai')) {
      showNotification('Please correct invalid API keys.', 'error');
      return;
    }

    try {
      /* 1) cache for this session */
      state.saveSettings(settings);

      /* 2) persist to localStorage */
      this.#saveToLocalStorage(settings);

      /* 3) UI side-effects */
      updateInputUIForModel(settings.model);
      updateHeaderModelSelect(settings.model);

      showNotification('Settings saved successfully', 'success');
      setTimeout(this.close, 1000);
    } catch (err) {
      console.error(err);
      showNotification('Error saving settings: ' + err.message, 'error');
    }
  }
}

/* ---------- Singleton instance ---------------------------------------- */

const settingsModal = new SettingsModal();

/* ---------- Public API ------------------------------------------------ */

export function openSettings()  { settingsModal.open(); }
export function closeSettings() { settingsModal.close(); }

/* Update the model dropdown after an external change */
export function updateSettingsModalSelect(model) {
  if (settingsModal.modelSelect) settingsModal.modelSelect.value = model;
}

/* Initialize after DOM is ready */
export function initializeSettingsModal() {
  document.addEventListener('DOMContentLoaded', () => {
    settingsModal.init();

    /* buttons that launch the modal */
    document.getElementById('settingsBtn' )?.addEventListener('click', openSettings); // sidebar
    document.getElementById('modelButton')?.addEventListener('click', openSettings); // toolbar
    document.getElementById('headerSettingsBtn')?.addEventListener('click', openSettings); // header
  });
}

/* Re-export for other modules that imported the old name */
export { settingsModal };
