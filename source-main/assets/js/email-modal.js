/**
 * Email Capture Modal
 * Handles email collection and API submission for Language Readiness book download
 */

(function () {
    'use strict';

    // API Configuration
    const API_URL = 'https://app.bloompod.vn/api/template/send';
    const INQUIRY_API_URL = 'https://app.bloompod.vn/api/inquiry';

    // DOM Elements
    let modal, overlay, form, input, errorMsg, submitBtn, spinner, successView, formView;

    // Initialize when DOM is ready
    function init() {
        // Get modal elements
        overlay = document.getElementById('emailModalOverlay');
        modal = document.getElementById('emailModal');
        form = document.getElementById('emailModalForm');
        input = document.getElementById('emailInput');
        errorMsg = document.getElementById('emailError');
        submitBtn = document.getElementById('emailSubmitBtn');
        spinner = document.getElementById('emailSpinner');
        successView = document.getElementById('emailSuccessView');
        formView = document.getElementById('emailFormView');

        // Get trigger button
        const triggerBtn = document.querySelector('.language-switcher-wrapper-button');

        if (!triggerBtn || !overlay) {
            console.error('Email modal: Required elements not found');
            return;
        }

        // Attach event listeners
        triggerBtn.addEventListener('click', openModal);

        // Close button
        const closeBtn = document.getElementById('emailModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Close on overlay click
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeModal();
            }
        });

        // Close on ESC key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                closeModal();
            }
        });

        // Form submission
        form.addEventListener('submit', handleSubmit);

        // Real-time validation
        input.addEventListener('input', function () {
            if (input.classList.contains('error')) {
                input.classList.remove('error');
                errorMsg.classList.remove('show');
            }
        });
    }

    // Open modal
    function openModal(e) {
        e.preventDefault();
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset form
        resetForm();

        // Focus input
        setTimeout(() => {
            input.focus();
        }, 300);
    }

    // Close modal
    function closeModal() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';

        // Reset after animation
        setTimeout(() => {
            resetForm();
        }, 300);
    }

    // Reset form to initial state
    function resetForm() {
        form.reset();
        input.classList.remove('error');
        errorMsg.classList.remove('show');
        submitBtn.disabled = false;
        spinner.classList.remove('show');
        formView.style.display = 'block';
        successView.classList.remove('show');
    }

    // Validate email
    function isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Show error message
    function showError(message) {
        errorMsg.textContent = message;
        errorMsg.classList.add('show');
        input.classList.add('error');
    }

    // Handle form submission
    async function handleSubmit(e) {
        e.preventDefault();

        const email = input.value.trim();

        const t = window.i18n || (k => k);

        // Validate email
        if (!email) {
            showError(t('email.errorRequired'));
            input.focus();
            return;
        }

        if (!isValidEmail(email)) {
            showError(t('email.errorInvalid'));
            input.focus();
            return;
        }

        // Disable submit button and show loading
        submitBtn.disabled = true;
        spinner.classList.add('show');

        try {
            // Call API
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    template_id: (window.i18nLang === 'en') ? 8 : 5,
                    email
                })
            });

            // Check response
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Email submitted successfully:', data);

            // Submit inquiry
            const isEn = window.i18nLang === 'en';
            fetch(INQUIRY_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: email.split('@')[0],
                    email: email,
                    message: isEn ? 'Download ebook English' : 'Download ebook tiếng Việt',
                    source_code: 'website'
                })
            }).catch(err => console.error('Inquiry error:', err));

            // Show success view
            showSuccess();

        } catch (error) {
            console.error('Error submitting email:', error);
            showError((window.i18n || (k => k))('email.errorServer'));
            submitBtn.disabled = false;
            spinner.classList.remove('show');
        }
    }

    // Show success view
    function showSuccess() {
        spinner.classList.remove('show');
        formView.style.display = 'none';
        successView.classList.add('show');

        // Auto close after 3 seconds
        setTimeout(() => {
            closeModal();
        }, 3000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
