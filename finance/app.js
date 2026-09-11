import { FinanceManager } from './js/store/financeManager.js';
import { UIController } from './js/ui/uiController.js';
import { CustomSelect } from './js/components/CustomSelect.js';

document.addEventListener('DOMContentLoaded', () => {
    const financeManager = new FinanceManager();
    const ui = new UIController(financeManager);

    window.app = ui;
    window.financeApp = { financeManager, ui };

    let deferredPrompt;
    const installButton = document.getElementById('installAppBtn');

    if (installButton) {
        installButton.style.display = 'none';

        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) return;

            installButton.style.display = 'none';
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        if (installButton) {
            installButton.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        if (installButton) {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    });

    document.querySelectorAll('select').forEach(select => {
        new CustomSelect(select);
    });

    const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (typeof flatpickr !== 'undefined' && !isMobile) {
        const baseConfig = {
            locale: 'pt',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'd/m/Y',
            disableMobile: true,
            theme: 'dark',
            allowInput: true,
            onReady: function (selectedDates, dateStr, instance) {
                const input = instance.altInput;
                input.setAttribute('inputmode', 'numeric');
                input.addEventListener('input', (e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 8) v = v.substring(0, 8);

                    if (v.length > 4) {
                        e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4)}`;
                    } else if (v.length > 2) {
                        e.target.value = `${v.substring(0, 2)}/${v.substring(2)}`;
                    } else {
                        e.target.value = v;
                    }
                });
            }
        };

        flatpickr("#editDate", baseConfig);

        const startDatePicker = flatpickr("#filterStartDate", {
            ...baseConfig,
            onChange: function (selectedDates, dateStr, instance) {
                endDatePicker.set('minDate', dateStr || null);
            }
        });

        const endDatePicker = flatpickr("#filterEndDate", {
            ...baseConfig,
            onChange: function (selectedDates, dateStr, instance) {
                startDatePicker.set('maxDate', dateStr || null);
            }
        });
    }
});

