/*! Tilda Promo v1.1.0 | (c) 2025 | build: 2025-09-04 */
// === Tilda Promo Integration v1.1.0 ===
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw-s_uEWpZo9S5Y8KIb4Mnz1SHK5tslDe7-azk7yYtZ0HY2tT74WTkUgCHgrW-fqalmuA/exec';
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
    boundElements: new Set(),
    promoContainer: null
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
    // Primary selector: input with name="promocode_user"
    let promoInput = document.querySelector('input[name="promocode_user"]');
    
    if (!promoInput) {
      // Fallback: find text/search input near "Промокод"/"Promo" label in cart form
      const cartForm = document.querySelector('form, .t-form, .t706__cartwin');
      if (cartForm) {
        const inputs = cartForm.querySelectorAll('input[type="text"], input[type="search"]');
        for (const input of inputs) {
          const container = input.closest('.t-form__inputsbox, .t-input-group, .t-form');
          if (container) {
            const labels = container.querySelectorAll('label, .t-input-title, .t-form__inputlabel');
            for (const label of labels) {
              if (label.textContent && (label.textContent.includes('Промокод') || label.textContent.toLowerCase().includes('promo'))) {
                promoInput = input;
                break;
              }
            }
          }
          if (promoInput) break;
        }
      }
    }
    
    if (promoInput) {
      TildaPromo.promoInput = promoInput;
      // Ensure stable name
      if (TildaPromo.promoInput.getAttribute('name') !== 'promocode_user') {
        TildaPromo.promoInput.setAttribute('name', 'promocode_user');
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
    
    // First check if we already created a promo apply button
    let button = parent.querySelector('.tilda-promo-apply');
    
    if (!button) {
      // Look for any existing button
      button = parent.querySelector('button, input[type="button"], input[type="submit"]');
    }
    
    if (!button) {
      // Create our own apply button
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'tilda-promo-apply';
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
    } else if (!button.classList.contains('tilda-promo-apply')) {
      // Mark existing button as our promo button
      button.classList.add('tilda-promo-apply');
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
    // Guard against double-binding
    if (TildaPromo.promoInput.__promoBound) return;
    TildaPromo.promoInput.__promoBound = true;
    
    // Input change - clear discount if code changed
    TildaPromo.promoInput.addEventListener('input', function() {
      const currentValue = this.value;
      if (TildaPromo.currentPromoCode && currentValue !== TildaPromo.currentPromoCode) {
        clearPromoDiscount();
      }
    });
    
    // Block Enter key on promo input
    TildaPromo.promoInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleApplyClick();
      }
    }, true);
    
    // Safer promo scope selector with priority
    const promoScope = TildaPromo.promoInput.closest('form.t-form') || 
                      TildaPromo.promoInput.closest('.t706__cartwin') ||
                      TildaPromo.promoInput.closest('.t-form__inputsbox') ||
                      TildaPromo.promoInput.closest('.t-input-group') ||
                      TildaPromo.promoInput.closest('form');
    if (promoScope) {
      // Guard against double-binding on scope
      if (promoScope.__promoCaptureBound) return;
      promoScope.__promoCaptureBound = true;
      
      // Capture-phase click listener for promo controls
      promoScope.addEventListener('click', function(e) {
        const isPromoControl = (
          e.target === TildaPromo.applyButton ||
          (e.target.tagName === 'BUTTON' && e.target.type === 'submit')
        );
        
        if (isPromoControl) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleApplyClick();
        }
      }, true);
      
      // Capture-phase submit listener
      promoScope.addEventListener('submit', function(e) {
        if (TildaPromo.promoInput && TildaPromo.promoInput.value) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          handleApplyClick();
        }
      }, true);
    }

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
        applyPromoDiscount(); // recalculateCartTotal() inside will trigger a redraw
        showMessage(MESSAGES.applied, 'success');
        
        // Close mobile keyboard
        TildaPromo.promoInput.blur();
        
        // Update hidden input with exact raw code
        if (TildaPromo.hiddenInput) {
          TildaPromo.hiddenInput.value = rawCode;
        }
        
      } else {
        clearPromoDiscount();
        showMessage(MESSAGES.invalid, 'error');
      }
      
    } catch (error) {
      console.error('[TildaPromo] Error applying promo:', error);
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
   * Uses GET with query params - Google Apps Script's /exec frequently issues 302 redirects;
   * some clients (and certain proxies) drop POST bodies on redirect. GET with query params
   * is reliable across all environments and avoids this class of issues.
   */
  async function verifyDirect(code) {
    // Feature-detect AbortSignal.timeout (Safari fallback)
    let controller, signal;
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      signal = AbortSignal.timeout(15000);
    } else if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      signal = controller.signal;
      setTimeout(() => { try { controller.abort(); } catch (_) {} }, 15000);
    }

    const attemptFetch = async () => {
      // Build query string with URLSearchParams
      const params = new URLSearchParams({
        action: 'verify',
        code: code,
        codeRaw: code,
        ts: Date.now().toString()
      });
      
      const response = await fetch(`${SCRIPT_URL}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        ...(signal ? { signal } : {})
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    };

    try {
      return await attemptFetch();
    } catch (error) {
      // Retry once on network-type errors (TypeError), not HTTP errors
      if (error instanceof TypeError) {
        console.warn('[TildaPromo] Network error, retrying once:', error.message);
        try {
          await new Promise(resolve => setTimeout(resolve, 400)); // 400ms delay
          return await attemptFetch();
        } catch (retryError) {
          console.error('[TildaPromo] Retry failed:', retryError);
          throw retryError;
        }
      } else {
        console.error('[TildaPromo] Direct fetch error:', error);
        throw error;
      }
    }
  }

  /**
   * Hardened price parsing - handles commas, spaces, and other formatting
   */
  function toNumber(value) {
    return Number(String(value).replace(/[^\d.-]/g, '') || 0);
  }

  /**
   * Sync line amounts - ensure each product.amount matches price * quantity
   */
  function syncLineAmounts() {
    if (!window.tcart || !window.tcart.products) return;
    
    window.tcart.products.forEach(product => {
      const price = toNumber(product.price);
      const quantity = Math.max(1, Math.floor(toNumber(product.quantity)));
      product.amount = price * quantity;
    });
  }

  /**
   * Sync cart totals - recalculate and set all total fields
   */
  function syncCartTotals() {
    if (!window.tcart || !window.tcart.products) return;
    
    const sum = window.tcart.products.reduce((s, p) => s + toNumber(p.amount), 0);
    window.tcart.total = sum;
    window.tcart.totalprice = sum;
    window.tcart.amount = sum;
    window.tcart.prodamount = sum;
  }

  /**
   * Internal cart reset helper - removes promo state cleanly (no UI side effects)
   */
  function resetCartPromoState() {
    if (!window.tcart || !window.tcart.products) return;

    // Iterate all cart lines in reverse order to safely remove clones
    for (let i = window.tcart.products.length - 1; i >= 0; i--) {
      const product = window.tcart.products[i];
      
      // If line is a promo clone → remove it
      if (product._promoClone) {
        window.tcart.products.splice(i, 1);
        continue;
      }
      
      // If line is promo-applied original → restore from stored originals
      if (product._promoApplied) {
        if (product._originalPrice !== undefined) {
          product.price = product._originalPrice;
        }
        if (product._originalAmount !== undefined) {
          product.amount = product._originalAmount;
        }
        if (product._originalQty !== undefined) {
          product.quantity = product._originalQty;
        }
      }
      
      // Clear all internal promo flags/original snapshots
      delete product._promoApplied;
      delete product._promoClone;
      delete product._originalPrice;
      delete product._originalAmount;
      delete product._originalQty;
    }
    
    // Sync line amounts after restoring originals
    syncLineAmounts();
  }

  /**
   * Apply promo discount - mutate cart lines so one physical unit becomes free
   */
  function applyPromoDiscount() {
    if (!window.tcart || !window.tcart.products || !window.tcart.products.length) {
      return;
    }

    // Reset any previous promo state before applying
    resetCartPromoState();

    // Find cheapest cart line where price > 0
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

    // If no positive-priced item found, consider promo applied (edge case)
    if (!cheapestItem || cheapestIndex < 0) {
      recalculateCartTotal();
      return;
    }

    const targetLine = window.tcart.products[cheapestIndex];
    const quantity = Math.max(1, Math.floor(toNumber(targetLine.quantity)));
    
    // Store original values before modification
    targetLine._originalPrice = toNumber(targetLine.price);
    if (targetLine.amount !== undefined) {
      targetLine._originalAmount = toNumber(targetLine.amount);
    }
    targetLine._originalQty = quantity;

    if (quantity === 1) {
      // If quantity = 1 → set that line's unit price to 0
      targetLine.price = 0;
      if (targetLine.amount !== undefined) {
        targetLine.amount = 0;
      }
      targetLine._promoApplied = true;
    } else {
      // If quantity > 1 → split the line
      // Decrease original line's quantity by 1
      targetLine.quantity = quantity - 1;
      targetLine._promoApplied = true;
      
      // Create clone for the free unit
      const cloneLine = JSON.parse(JSON.stringify(targetLine));
      cloneLine.quantity = 1;
      cloneLine.price = 0;
      if (cloneLine.amount !== undefined) {
        cloneLine.amount = 0;
      }
      cloneLine._promoApplied = true;
      cloneLine._promoClone = true;
      
      // Generate unique uid for clone if needed
      if (cloneLine.uid) {
        cloneLine.uid = cloneLine.uid + '_promo_free';
      }
      
      // Insert clone right after the original line
      window.tcart.products.splice(cheapestIndex + 1, 0, cloneLine);
    }

    recalculateCartTotal();
  }

  /**
   * Clear promo discount
   */
  function clearPromoDiscount() {
    if (!window.tcart || !window.tcart.products) return;

    // Call the internal cart reset helper
    resetCartPromoState();
    
    // Reset current promo code and hidden input
    TildaPromo.currentPromoCode = null;
    if (TildaPromo.hiddenInput) {
      TildaPromo.hiddenInput.value = '';
    }

    // Remove all promo badges across the cart
    document.querySelectorAll('.promo-free-badge').forEach(badge => badge.remove());

    // Recalculate totals and hide messages
    recalculateCartTotal();
    hideMessage();
  }

  /**
   * Recalculate cart total - simplified to sum line prices * quantity
   */
  function recalculateCartTotal() {
    if (!window.tcart || !window.tcart.products) return;

    // Set promocode for traceability
    window.tcart.promocode = TildaPromo.currentPromoCode || '';
    window.tcart.promocode_discount = 0; // No separate discount accumulator
    
    // Sync line amounts and cart totals
    syncLineAmounts();
    syncCartTotals();
    
    forceRedraw();
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
   * Manual cart UI update (fallback) - badge rules: only show on zero-price lines
   */
  function updateCartUI() {
    // Update total display
    const totalElements = document.querySelectorAll('.t706__cartwin-total-price, .t-cart__total-price, .st100__total-price');
    totalElements.forEach(el => {
      if (window.tcart && window.tcart.total !== undefined) {
        el.textContent = window.tcart.total.toFixed(2);
      }
    });

    // Update individual item displays and add promo indicators
    const itemElements = document.querySelectorAll('.t706__cartwin-item, .t-cart__item, .st100__cartitem');
    itemElements.forEach((itemEl, index) => {
      if (window.tcart.products[index]) {
        const product = window.tcart.products[index];
        
        // Remove any existing promo badges
        const existingBadge = itemEl.querySelector('.promo-free-badge');
        if (existingBadge) {
          existingBadge.remove();
        }
        
        // Only show "1 item free" badge on lines that are actually promo-applied AND have zero price
        const price = toNumber(product.price);
        if (product._promoApplied && price === 0) {
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
          const nameEl = itemEl.querySelector('.t706__cartwin-item-title, .t-cart__item-title, .st100__title');
          const priceEl = itemEl.querySelector('.t706__cartwin-item-price, .t-cart__item-price, .st100__price');
          
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
   * Force cart redraw
   */
  function forceRedraw() {
    // Call Tilda internal recalc functions if they exist
    if (typeof window.tcart__recalcProductsPrice === 'function') {
      window.tcart__recalcProductsPrice();
    }
    if (typeof window.tcart__recalcTotal === 'function') {
      window.tcart__recalcTotal();
    } else if (typeof window.tcart__updateTotal === 'function') {
      window.tcart__updateTotal();
    }
    
    if (typeof window.tcart__reDrawCart === 'function') {
      window.tcart__reDrawCart();
      setTimeout(() => {
        if (typeof window.tcart__reDrawCart === 'function') {
          window.tcart__reDrawCart();
        }
      }, 50);
    } else {
      // Fallback to redrawCart if tcart__reDrawCart is missing
      redrawCart();
    }
    updateCartDiscountWording();
    
    // Fire events for ST100 compatibility
    document.dispatchEvent(new Event('tcart_change'));
    document.dispatchEvent(new Event('tcart_update'));
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
   * Reapply promo discount if active - safer re-apply
   */
  function reapplyPromoIfActive() {
    if (TildaPromo.currentPromoCode && window.tcart && window.tcart.products && window.tcart.products.length > 0) {
      // applyPromoDiscount() already calls resetCartPromoState() which calls syncLineAmounts()
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
   * Setup mutation observer for dynamic content
   */
  function setupMutationObserver() {
    if (TildaPromo.mutationObserver) {
      TildaPromo.mutationObserver.disconnect();
    }
    
    TildaPromo.mutationObserver = new MutationObserver((mutations) => {
      let shouldRebind = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if new elements contain promo-related buttons
              if (node.querySelector && (
                node.querySelector('button') || 
                node.querySelector('input[type="submit"]') ||
                node.querySelector('input[name="promocode_user"]')
              )) {
                shouldRebind = true;
              }
            }
          });
        }
      });
      
      if (shouldRebind) {
        setTimeout(setupEventListeners, 100);
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
   * Update cart discount wording
   */
  function updateCartDiscountWording() {
    // Only update if promo is applied
    if (!TildaPromo.currentPromoCode) {
      // Remove disclaimer if no promo
      document.querySelectorAll('.tilda-promo-disclaimer').forEach(el => el.remove());
      return;
    }
    
    // Find discount text elements
    const discountSelectors = [
      '.t706__cartwin-discount',
      '.t-cart__discount',
      '.t706__cartwin-total-discount',
      '.t-cart__total-discount'
    ];
    
    let updated = false;
    const targetText = 'Ваша скидка на один товар: 100%';
    
    discountSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent;
        if (text && (/Ваша\s*скидка:\s*100%/i.test(text) || /Скидка:\s*100%/i.test(text))) {
          el.textContent = targetText;
          updated = true;
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
        disclaimer.textContent = targetText;
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

  // Add debug helpers
  window.TildaPromoDebug = {
    getCurrentPromo: () => TildaPromo.currentPromoCode,
    getCartState: () => window.tcart,
    clearPromo: () => clearPromoDiscount(),
    forceRedraw: () => forceRedraw(),
    version: 'v1.1.0'
  };

  // Cleanup on page unload
  window.addEventListener('beforeunload', function() {
    if (TildaPromo.intervalId) {
      clearInterval(TildaPromo.intervalId);
    }
    if (TildaPromo.mutationObserver) {
      TildaPromo.mutationObserver.disconnect();
    }
    TildaPromo.mutationObserver = null;
  });

})();
