// === Tilda Promo Integration v1.0.1 ===
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwFzq2_UU_omXvNHIxZA6m892mBWNQhWua2VDd-TV8aKxfrjL58p_F792GvMxqB0u-W5Q/exec';
const MESSAGES = {
  applied: 'Promo code applied — 1 item free',
  invalid: 'Promo code is invalid or already used',
  error: 'Couldn\'t verify promo. Please try again.'
};
// ==========================================

(function() {
  'use strict';

  // Namespace to avoid global collisions
  const TildaPromo = {
    currentPromoCode: null,
    isProcessing: false,
    messageElement: null,
    applyButton: null,
    promoInput: null,
    hiddenInput: null,
    originalCartData: null,
    intervalId: null,
    mutationObserver: null,
    boundElements: new Set()
  };

  /**
   * Initialize the promo code system
   */
  function init() {
    try {
      // Check if Tilda cart exists
      if (!window.tcart) {
        return false;
      }

      // Find promo input and setup UI
      if (!findPromoElements()) {
        return false;
      }

      setupEventListeners();
      console.log('[TildaPromo] Initialized successfully');
      return true;

    } catch (error) {
      console.error('[TildaPromo] Initialization error:', error);
      return false;
    }
  }

  /**
   * Find promo input and related elements
   */
  function findPromoElements() {
    // Primary selector: input with name="promocode"
    TildaPromo.promoInput = document.querySelector('input[name="promocode"]');
    
    // Fallback: search for inputs with promo-related placeholders
    if (!TildaPromo.promoInput) {
      const inputs = document.querySelectorAll('input[type="text"], input[type="search"]');
      for (const input of inputs) {
        const placeholder = (input.placeholder || '').toLowerCase();
        if (placeholder.includes('promo') || placeholder.includes('промо') || 
            placeholder.includes('код') || placeholder.includes('code')) {
          TildaPromo.promoInput = input;
          break;
        }
      }
    }

    if (!TildaPromo.promoInput) {
      return false;
    }

    // Find or create apply button
    TildaPromo.applyButton = findOrCreateApplyButton();
    
    // Create hidden input for Tilda/CRM integration
    createHiddenInput();
    
    // Create message element
    createMessageElement();
    
    // Hide Tilda hints
    hideTildaHints();
    
    // Setup mutation observer for dynamic content
    setupMutationObserver();

    return true;
  }

  /**
   * Find existing apply button or create new one
   */
  function findOrCreateApplyButton() {
    // Look for existing button near the input
    const parent = TildaPromo.promoInput.parentElement;
    let button = parent.querySelector('button, input[type="button"], input[type="submit"]');
    
    if (!button) {
      // Create our own apply button
      button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Apply';
      button.style.cssText = `
        margin-left: 8px;
        padding: 6px 12px;
        background: #000;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      `;
      
      // Insert after the input
      TildaPromo.promoInput.parentNode.insertBefore(button, TildaPromo.promoInput.nextSibling);
    }

    return button;
  }

  /**
   * Create hidden input for Tilda form submission
   */
  function createHiddenInput() {
    const form = TildaPromo.promoInput.closest('form');
    if (!form) {
      return;
    }

    TildaPromo.hiddenInput = form.querySelector('input[name="promocode_copy"]');
    
    if (!TildaPromo.hiddenInput) {
      TildaPromo.hiddenInput = document.createElement('input');
      TildaPromo.hiddenInput.type = 'hidden';
      TildaPromo.hiddenInput.name = 'promocode_copy';
      TildaPromo.hiddenInput.value = '';
      form.appendChild(TildaPromo.hiddenInput);
      console.log('[TildaPromo] Created hidden promocode_copy input');
    }
  }

  /**
   * Create message element for user feedback
   */
  function createMessageElement() {
    TildaPromo.messageElement = document.createElement('div');
    TildaPromo.messageElement.style.cssText = `
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      display: none;
      transition: all 0.3s ease;
      z-index: 9999 !important;
      position: relative;
    `;
    
    // Insert after the input or button
    const insertAfter = TildaPromo.applyButton || TildaPromo.promoInput;
    insertAfter.parentNode.insertBefore(TildaPromo.messageElement, insertAfter.nextSibling);
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Block native Tilda promo behavior
    blockNativeTildaPromo();
    
    // Input change - clear discount if code changed
    TildaPromo.promoInput.addEventListener('input', function() {
      const currentValue = this.value;
      if (TildaPromo.currentPromoCode && currentValue !== TildaPromo.currentPromoCode) {
        clearPromoDiscount();
      }
    });

    // Listen for cart changes
    if (window.tcart) {
      // Override cart methods to detect changes
      interceptCartMethods();
      
      // Periodic check for cart changes (prevent duplicate intervals)
      if (!TildaPromo.intervalId) {
        TildaPromo.intervalId = setInterval(checkCartChanges, 2000);
      }
    }
  }

  /**
   * Handle apply button click
   */
  async function handleApplyClick() {
    if (TildaPromo.isProcessing) return;

    const rawCode = TildaPromo.promoInput.value;
    
    if (!rawCode.trim()) {
      showMessage(MESSAGES.invalid, 'error');
      return;
    }

    // One-promo guard: avoid redundant re-applications
    if (TildaPromo.currentPromoCode === rawCode) {
      return;
    }

    TildaPromo.isProcessing = true;
    showMessage('Verifying...', 'info');

    try {
      const result = await verifyPromoCode(rawCode);
      
      if (result.ok && result.valid) {
        // Apply discount - store exact code as typed
        TildaPromo.currentPromoCode = rawCode;
        applyPromoDiscount();
        showMessage(MESSAGES.applied, 'success');
        
        // Update hidden input with exact raw code
        if (TildaPromo.hiddenInput) {
          TildaPromo.hiddenInput.value = rawCode;
        }
        
      } else {
        clearPromoDiscount();
        showMessage(MESSAGES.invalid, 'error');
      }
      
    } catch (error) {
      console.error('[TildaPromo] Verification error:', error);
      clearPromoDiscount();
      showMessage(MESSAGES.error, 'error');
    } finally {
      TildaPromo.isProcessing = false;
    }
  }

  /**
   * Verify promo code with server
   */
  async function verifyPromoCode(code) {
    return await verifyDirect(code);
  }

  /**
   * Verify directly with Apps Script
   */
  async function verifyDirect(code) {
    // Feature-detect AbortSignal.timeout (Safari fallback)
    let controller, signal;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(10000);
    } else if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      signal = controller.signal;
      setTimeout(() => { try { controller.abort(); } catch (_) {} }, 10000);
    }

    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({ action: 'verify', code: code, codeRaw: code }),
        redirect: 'manual', // Critical: Don't follow 302 redirects automatically
        ...(signal ? { signal } : {})
      });

      // Handle CORS error (status 0)
      if (response.status === 0) {
        console.error('[TildaPromo] CORS blocked');
        throw new Error('CORS blocked');
      }

      // Handle Apps Script 302 redirect manually
      if (response.status === 302) {
        const location = response.headers.get('Location');
        if (location) {
          // Follow redirect with GET request only
          const redirectResponse = await fetch(location, {
            method: 'GET',
            ...(signal ? { signal } : {})
          });
          
          if (!redirectResponse.ok) {
            throw new Error(`HTTP ${redirectResponse.status}: ${redirectResponse.statusText}`);
          }
          
          const jsonResult = await redirectResponse.json();
          return jsonResult;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonResult = await response.json();
      return jsonResult;
    } catch (error) {
      console.error('[TildaPromo] Direct fetch error:', error);
      throw error;
    }
  }

  /**
   * Hardened price parsing - handles commas, spaces, and other formatting
   */
  function toNumber(value) {
    return Number(String(value).replace(/[^\d.-]/g, '') || 0);
  }

  /**
   * Apply promo discount - make exactly one unit of cheapest item free (quantity-safe)
   */
  function applyPromoDiscount() {
    if (!window.tcart || !window.tcart.products || !window.tcart.products.length) {
      return;
    }

    // Store original data if not already stored
    if (!TildaPromo.originalCartData) {
      TildaPromo.originalCartData = JSON.parse(JSON.stringify(window.tcart.products));
    }

    // Find cheapest item with hardened price parsing
    let cheapestItem = null;
    let cheapestPrice = Infinity;
    let cheapestIndex = -1;

    window.tcart.products.forEach((product, index) => {
      const price = toNumber(product.price);
      if (price > 0 && price < cheapestPrice) {
        cheapestPrice = price;
        cheapestItem = product;
        cheapestIndex = index;
      }
    });

    if (cheapestItem && cheapestIndex >= 0) {
      // Clear any existing promo discounts
      window.tcart.products.forEach(product => {
        delete product._promoDiscount;
        delete product._originalPrice;
        delete product._promoApplied;
      });

      // Mark the cheapest item for discount (but don't change its price)
      const product = window.tcart.products[cheapestIndex];
      product._promoDiscount = toNumber(product.price); // Store discount amount for one unit
      product._originalPrice = toNumber(product.price);
      product._promoApplied = true; // Flag for UI updates

      // Recalculate cart total (this will subtract one unit's price)
      recalculateCartTotal();
      
      // Trigger cart redraw
      redrawCart();
    }
  }

  /**
   * Clear promo discount
   */
  function clearPromoDiscount() {
    if (!window.tcart || !window.tcart.products) return;

    TildaPromo.currentPromoCode = null;
    
    // Clear promo flags (but don't restore prices since we never changed them)
    window.tcart.products.forEach(product => {
      delete product._promoDiscount;
      delete product._originalPrice;
      delete product._promoApplied;
    });

    // Clear hidden input
    if (TildaPromo.hiddenInput) {
      TildaPromo.hiddenInput.value = '';
    }

    recalculateCartTotal();
    redrawCart();
    hideMessage();
  }

  /**
   * Recalculate cart total with quantity-safe promo discount
   */
  function recalculateCartTotal() {
    if (!window.tcart || !window.tcart.products) return;

    let total = 0;
    let promoDiscount = 0;

    // Calculate normal total with hardened parsing
    window.tcart.products.forEach(product => {
      const price = toNumber(product.price);
      const quantity = Math.max(1, Math.floor(toNumber(product.quantity)));
      total += price * quantity;
      
      // If this product has promo applied, subtract exactly one unit's price
      if (product._promoApplied && product._promoDiscount) {
        promoDiscount = toNumber(product._promoDiscount);
      }
    });

    // Apply promo discount (subtract exactly one unit of cheapest item)
    total = Math.max(0, total - promoDiscount);

    window.tcart.total = total;
    window.tcart.totalprice = total;
  }

  /**
   * Trigger cart redraw
   */
  function redrawCart() {
    try {
      // Try Tilda's built-in redraw function
      if (typeof window.tcart__reDrawCart === 'function') {
        window.tcart__reDrawCart();
      } else if (typeof window.tcart_redraw === 'function') {
        window.tcart_redraw();
      } else {
        // Manual UI update fallback
        updateCartUI();
      }
    } catch (error) {
      console.warn('[TildaPromo] Cart redraw error:', error);
      updateCartUI();
    }
  }

  /**
   * Manual cart UI update (fallback) with quantity-safe promo indicators
   */
  function updateCartUI() {
    // Update total display
    const totalElements = document.querySelectorAll('.t706__cartwin-total-price, .t-cart__total-price');
    totalElements.forEach(el => {
      if (window.tcart && window.tcart.total !== undefined) {
        el.textContent = window.tcart.total.toFixed(2);
      }
    });

    // Update individual item displays and add promo indicators
    const itemElements = document.querySelectorAll('.t706__cartwin-item, .t-cart__item');
    itemElements.forEach((itemEl, index) => {
      if (window.tcart.products[index]) {
        const product = window.tcart.products[index];
        
        // Remove any existing promo badges
        const existingBadge = itemEl.querySelector('.promo-free-badge');
        if (existingBadge) {
          existingBadge.remove();
        }
        
        // Add "1 item free" badge if this product has promo applied
        if (product._promoApplied) {
          const badge = document.createElement('span');
          badge.className = 'promo-free-badge';
          badge.textContent = '1 item free';
          badge.style.cssText = `
            background: #28a745;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            margin-left: 8px;
            display: inline-block;
          `;
          
          // Try to append to the item name or price area
          const nameEl = itemEl.querySelector('.t706__cartwin-item-title, .t-cart__item-title');
          const priceEl = itemEl.querySelector('.t706__cartwin-item-price, .t-cart__item-price');
          
          if (nameEl) {
            nameEl.appendChild(badge);
          } else if (priceEl) {
            priceEl.parentNode.appendChild(badge);
          }
        }
      }
    });
    
    // Update cart discount wording
    updateCartDiscountWording();
  }

  /**
   * Intercept cart methods to detect changes
   */
  function interceptCartMethods() {
    if (!window.tcart) return;

    // Store original methods
    const originalAdd = window.tcart.addProduct;
    const originalRemove = window.tcart.removeProduct;
    const originalUpdate = window.tcart.updateProduct;

    // Override add method
    if (originalAdd) {
      window.tcart.addProduct = function(...args) {
        const result = originalAdd.apply(this, args);
        setTimeout(() => reapplyPromoIfActive(), 100);
        return result;
      };
    }

    // Override remove method
    if (originalRemove) {
      window.tcart.removeProduct = function(...args) {
        const result = originalRemove.apply(this, args);
        setTimeout(() => reapplyPromoIfActive(), 100);
        return result;
      };
    }

    // Override update method
    if (originalUpdate) {
      window.tcart.updateProduct = function(...args) {
        const result = originalUpdate.apply(this, args);
        setTimeout(() => reapplyPromoIfActive(), 100);
        return result;
      };
    }
  }

  /**
   * Check for cart changes and reapply promo if needed
   */
  function checkCartChanges() {
    if (!TildaPromo.currentPromoCode || !window.tcart) return;

    // If cart is empty, clear promo
    if (!window.tcart.products || window.tcart.products.length === 0) {
      clearPromoDiscount();
      return;
    }

    // Reapply promo to ensure only one cheapest item is free
    reapplyPromoIfActive();
  }

  /**
   * Reapply promo discount if active
   */
  function reapplyPromoIfActive() {
    if (TildaPromo.currentPromoCode && window.tcart && window.tcart.products && window.tcart.products.length > 0) {
      // Clear current discount and reapply
      TildaPromo.originalCartData = null; // Reset original data
      applyPromoDiscount();
    }
  }

  /**
   * Show message to user with CSS class resilience
   */
  function showMessage(text, type = 'info') {
    if (!TildaPromo.messageElement) return;

    TildaPromo.messageElement.textContent = text;
    TildaPromo.messageElement.style.display = 'block';
    
    // Clear previous classes
    TildaPromo.messageElement.className = 'tilda-promo-message';
    
    // Add type-specific class and inline styles for resilience
    switch (type) {
      case 'success':
        TildaPromo.messageElement.className += ' tilda-promo-success';
        TildaPromo.messageElement.style.backgroundColor = '#d4edda';
        TildaPromo.messageElement.style.color = '#155724';
        TildaPromo.messageElement.style.border = '1px solid #c3e6cb';
        break;
      case 'error':
        TildaPromo.messageElement.className += ' tilda-promo-error';
        TildaPromo.messageElement.style.backgroundColor = '#f8d7da';
        TildaPromo.messageElement.style.color = '#721c24';
        TildaPromo.messageElement.style.border = '1px solid #f5c6cb';
        break;
      case 'info':
      default:
        TildaPromo.messageElement.className += ' tilda-promo-info';
        TildaPromo.messageElement.style.backgroundColor = '#d1ecf1';
        TildaPromo.messageElement.style.color = '#0c5460';
        TildaPromo.messageElement.style.border = '1px solid #bee5eb';
        break;
    }

    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => hideMessage(), 5000);
    }
  }

  /**
   * Hide message
   */
  function hideMessage() {
    if (TildaPromo.messageElement) {
      TildaPromo.messageElement.style.display = 'none';
    }
  }

  /**
   * Initialize when DOM is ready
   */
  function tryInit() {
    if (init()) {
      return; // Successfully initialized
    }
    
    // Retry initialization
    setTimeout(tryInit, 1000);
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  // Also try after page load
  window.addEventListener('load', () => {
    setTimeout(tryInit, 500);
  });

  /**
   * Hide Tilda hints about dash symbol
   */
  function hideTildaHints() {
    const selectors = [
      '.t-input-title',
      '.t-input-block__title',
      '.t-form__inputlabel',
      '.t-form__title',
      '.t-descr',
      '.t-text'
    ];
    
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (el.textContent && el.textContent.includes('Вводить без символа')) {
          el.style.display = 'none';
        }
      });
    });
    
    // Also check for text nodes near the promo input
    if (TildaPromo.promoInput) {
      const parent = TildaPromo.promoInput.closest('.t-form__inputsbox, .t-input-group, .t-form');
      if (parent) {
        const walker = document.createTreeWalker(
          parent,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent && node.textContent.includes('Вводить без символа')) {
            if (node.parentElement) {
              node.parentElement.style.display = 'none';
            }
          }
        }
      }
    }
  }

  /**
   * Setup mutation observer for dynamic content
   */
  function setupMutationObserver() {
    if (TildaPromo.mutationObserver) {
      TildaPromo.mutationObserver.disconnect();
    }
    
    TildaPromo.mutationObserver = new MutationObserver((mutations) => {
      let shouldRehide = false;
      let shouldRebind = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if new elements contain hint text
              if (node.textContent && node.textContent.includes('Вводить без символа')) {
                shouldRehide = true;
              }
              
              // Check if new elements contain promo-related buttons
              if (node.querySelector && (
                node.querySelector('button') || 
                node.querySelector('input[type="submit"]') ||
                node.querySelector('input[name="promocode"]')
              )) {
                shouldRebind = true;
              }
            }
          });
        }
      });
      
      if (shouldRehide) {
        setTimeout(hideTildaHints, 100);
      }
      
      if (shouldRebind) {
        setTimeout(blockNativeTildaPromo, 100);
      }
      
      // Always update cart wording when DOM changes
      setTimeout(updateCartDiscountWording, 100);
    });
    
    TildaPromo.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Block native Tilda promo behavior
   */
  function blockNativeTildaPromo() {
    // Find all potential apply buttons
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    
    buttons.forEach(button => {
      // Skip if already bound
      if (TildaPromo.boundElements.has(button)) {
        return;
      }
      
      // Check if button is related to promo input
      const isPromoButton = (
        button === TildaPromo.applyButton ||
        button.closest('.t-form') === TildaPromo.promoInput?.closest('.t-form') ||
        button.textContent.toLowerCase().includes('apply') ||
        button.textContent.toLowerCase().includes('применить')
      );
      
      if (isPromoButton) {
        // Add capture-phase listener to block native behavior
        button.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleApplyClick();
        }, true);
        
        TildaPromo.boundElements.add(button);
      }
    });
    
    // Also block form submission if it contains promo input
    if (TildaPromo.promoInput) {
      const form = TildaPromo.promoInput.closest('form');
      if (form && !TildaPromo.boundElements.has(form)) {
        form.addEventListener('submit', function(e) {
          // Only prevent if promo input has focus or was recently used
          if (document.activeElement === TildaPromo.promoInput || TildaPromo.promoInput.value) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            handleApplyClick();
          }
        }, true);
        
        TildaPromo.boundElements.add(form);
      }
    }
    
    // Block Enter key on promo input
    if (TildaPromo.promoInput && !TildaPromo.boundElements.has(TildaPromo.promoInput)) {
      TildaPromo.promoInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleApplyClick();
        }
      }, true);
      
      TildaPromo.boundElements.add(TildaPromo.promoInput);
    }
  }

  /**
   * Update cart discount wording
   */
  function updateCartDiscountWording() {
    // Only update if promo is applied
    if (!TildaPromo.currentPromoCode) return;
    
    // Find discount text elements
    const discountSelectors = [
      '.t706__cartwin-discount',
      '.t-cart__discount',
      '.t706__cartwin-total-discount',
      '.t-cart__total-discount'
    ];
    
    let updated = false;
    
    discountSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent;
        if (text && (text.includes('Ваша скидка: 100%') || text.includes('скидка: 100%'))) {
          if (!text.includes('на один товар')) {
            el.textContent = text.replace('100%', '100% на один товар');
            updated = true;
          }
        }
      });
    });
    
    // If no existing discount text found, inject our own
    if (!updated && TildaPromo.currentPromoCode) {
      const cartTotal = document.querySelector('.t706__cartwin-total, .t-cart__total');
      if (cartTotal) {
        // Remove existing disclaimer
        const existingDisclaimer = cartTotal.querySelector('.tilda-promo-disclaimer');
        if (existingDisclaimer) {
          existingDisclaimer.remove();
        }
        
        // Add our disclaimer
        const disclaimer = document.createElement('div');
        disclaimer.className = 'tilda-promo-disclaimer';
        disclaimer.textContent = 'Ваша скидка: 100% на один товар';
        disclaimer.style.cssText = `
          font-size: 12px;
          color: #666;
          margin-top: 4px;
          font-style: italic;
        `;
        
        cartTotal.appendChild(disclaimer);
      }
    }
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (TildaPromo.intervalId) {
      clearInterval(TildaPromo.intervalId);
      TildaPromo.intervalId = null;
    }
    
    if (TildaPromo.mutationObserver) {
      TildaPromo.mutationObserver.disconnect();
      TildaPromo.mutationObserver = null;
    }
  });

})();
