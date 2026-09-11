export class CustomSelect {
    constructor(originalSelect) {
        this.originalSelect = originalSelect;
        this.originalSelect.style.display = 'none';
        this.customSelect = null;
        this.trigger = null;
        this.optionsList = null;
        this.isOpen = false;

        this.init();
        this.setupObservers();
    }

    init() {
        this.customSelect = document.createElement('div');
        this.customSelect.classList.add('custom-select-container');

        this.originalSelect.customSelect = this;

        this.render();

        this.originalSelect.parentNode.insertBefore(this.customSelect, this.originalSelect.nextSibling);

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.customSelect.contains(e.target)) {
                this.close();
            }
        });
    }

    render() {
        this.customSelect.innerHTML = '';

        this.trigger = document.createElement('div');
        this.trigger.classList.add('select-trigger');
        this.updateTriggerText();

        this.trigger.addEventListener('click', () => {
            this.toggle();
        });

        this.optionsList = document.createElement('div');
        this.optionsList.classList.add('custom-options');

        this.buildOptions();

        const arrow = document.createElement('div');
        arrow.classList.add('select-arrow');
        arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        this.trigger.appendChild(arrow);

        this.customSelect.appendChild(this.trigger);
        this.customSelect.appendChild(this.optionsList);
    }

    buildOptions() {
        const groups = this.originalSelect.querySelectorAll('optgroup');
        const directOptions = this.originalSelect.querySelectorAll(':scope > option');

        if (directOptions.length > 0) {
            directOptions.forEach(opt => {
                this.optionsList.appendChild(this.createOptionElement(opt));
            });
        }

        groups.forEach(group => {
            const groupLabel = document.createElement('div');
            groupLabel.classList.add('custom-option-group');
            groupLabel.textContent = group.label;
            this.optionsList.appendChild(groupLabel);

            const groupOptions = group.querySelectorAll('option');
            groupOptions.forEach(opt => {
                this.optionsList.appendChild(this.createOptionElement(opt));
            });
        });
    }

    createOptionElement(option) {
        const div = document.createElement('div');
        div.classList.add('custom-option');
        div.innerHTML = this.formatContent(option.textContent);
        div.dataset.value = option.value;

        if (option.selected) {
            div.classList.add('selected');
        }

        div.addEventListener('click', () => {
            this.selectOption(option);
        });

        return div;
    }

    selectOption(optionElement) {
        this.originalSelect.value = optionElement.value;

        const event = new Event('change', { bubbles: true });
        this.originalSelect.dispatchEvent(event);

        this.updateTriggerText();
        this.close();

        const allOptions = this.optionsList.querySelectorAll('.custom-option');
        allOptions.forEach(el => el.classList.remove('selected'));

        const selected = Array.from(allOptions).find(el => el.dataset.value === optionElement.value);
        if (selected) selected.classList.add('selected');
    }

    updateTriggerText() {
        const selectedOption = this.originalSelect.options[this.originalSelect.selectedIndex];
        if (selectedOption) {
            let textSpan = this.trigger.querySelector('.trigger-text');
            if (!textSpan) {
                textSpan = document.createElement('div');
                textSpan.classList.add('trigger-text');
                this.trigger.prepend(textSpan);
            }
            textSpan.innerHTML = this.formatContent(selectedOption.textContent);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        document.querySelectorAll('.custom-select-container').forEach(el => {
            if (el !== this.customSelect) el.classList.remove('active');
        });
        document.querySelectorAll('.custom-options').forEach(el => {
            if (el !== this.optionsList) el.classList.remove('open');
        });

        this.customSelect.classList.add('active');
        this.optionsList.classList.add('open');
        this.isOpen = true;
    }

    close() {
        this.customSelect.classList.remove('active');
        this.optionsList.classList.remove('open');
        this.isOpen = false;
    }

    setupObservers() {
        this.observer = new MutationObserver(() => {
            this.optionsList.innerHTML = '';
            this.buildOptions();
            this.updateTriggerText();
        });

        this.observer.observe(this.originalSelect, { childList: true, subtree: true });

        this.originalSelect.addEventListener('change', () => {
            this.updateTriggerText();
            const allOptions = this.optionsList.querySelectorAll('.custom-option');
            allOptions.forEach(el => {
                if (el.dataset.value === this.originalSelect.value) el.classList.add('selected');
                else el.classList.remove('selected');
            });
        });
    }

    formatContent(text) {
        const trimmed = text.trim();
        const emojiMatch = trimmed.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
        if (emojiMatch) {
            const emoji = emojiMatch[0];
            const rest = trimmed.substring(emoji.length).trim();
            return `<span class="opt-icon">${emoji}</span><span class="opt-text">${rest}</span>`;
        }
        return trimmed;
    }
}

