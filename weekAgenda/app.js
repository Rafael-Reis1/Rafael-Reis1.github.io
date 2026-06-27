document.addEventListener('DOMContentLoaded', () => {
    const weekView = document.getElementById('week-view');
    const monthView = document.getElementById('month-view');
    const viewWeekBtn = document.getElementById('view-week-btn');
    const viewMonthBtn = document.getElementById('view-month-btn');
    const currentDateDisplay = document.getElementById('current-date-display');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const todayBtn = document.getElementById('today-btn');
    
    const timeLabelsContainer = document.querySelector('.time-labels');
    const daysGrid = document.querySelector('.days-grid');
    const monthGrid = document.getElementById('month-grid');
    
    const modal = document.getElementById('event-modal');
    const eventForm = document.getElementById('event-form');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const deleteEventBtn = document.getElementById('delete-event-btn');
    const modalTitle = document.getElementById('modal-title');
    
    const confirmModal = document.getElementById('confirm-modal');
    const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    
    const idInput = document.getElementById('event-id');
    const titleInput = document.getElementById('event-title');
    const dateInput = document.getElementById('event-date');
    const endDateInput = document.getElementById('event-end-date');
    const startInput = document.getElementById('event-start');
    const endInput = document.getElementById('event-end');
    const allDayCheckbox = document.getElementById('event-all-day');
    const timeInputsContainer = document.getElementById('time-inputs-container');

    allDayCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            timeInputsContainer.classList.add('hidden');
            startInput.required = false;
            endInput.required = false;
        } else {
            timeInputsContainer.classList.remove('hidden');
            startInput.required = true;
            endInput.required = true;
        }
    });

    let currentView = 'month';
    let currentDate = new Date();
    let returnToDayListDate = null;
    
    const colorMap = {
        'blue': { bg: 'rgba(59, 130, 246, 0.25)', border: '#3b82f6', text: '#93c5fd' },
        'red': { bg: 'rgba(239, 68, 68, 0.25)', border: '#ef4444', text: '#fca5a5' },
        'green': { bg: 'rgba(34, 197, 94, 0.25)', border: '#22c55e', text: '#86efac' },
        'yellow': { bg: 'rgba(245, 158, 11, 0.25)', border: '#f59e0b', text: '#fcd34d' },
        'purple': { bg: 'rgba(168, 85, 247, 0.25)', border: '#a855f7', text: '#d8b4fe' }
    };

    let rawEvents = localStorage.getItem('weekAgendaEvents_v2');
    let events = rawEvents ? JSON.parse(rawEvents) : [];
    
    let migrated = false;
    events = events.map(ev => {
        if(ev.date) {
            ev.startDate = ev.date;
            ev.endDate = ev.date;
            delete ev.date;
            migrated = true;
        }
        return ev;
    });
    if(migrated) localStorage.setItem('weekAgendaEvents_v2', JSON.stringify(events));

    function saveEvents() {
        localStorage.setItem('weekAgendaEvents_v2', JSON.stringify(events));
        render();
    }
    
    function getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        return new Date(d.setDate(diff));
    }
    
    function formatDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    viewWeekBtn.addEventListener('click', () => { setView('week'); });
    viewMonthBtn.addEventListener('click', () => { setView('month'); });
    
    prevBtn.addEventListener('click', () => {
        if(currentView === 'week') {
            currentDate.setDate(currentDate.getDate() - 7);
        } else {
            currentDate.setMonth(currentDate.getMonth() - 1);
        }
        render();
    });
    
    nextBtn.addEventListener('click', () => {
        if(currentView === 'week') {
            currentDate.setDate(currentDate.getDate() + 7);
        } else {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        render();
    });
    
    todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        render();
    });

    let scrollTimeout;
    document.querySelector('.app-container').addEventListener('wheel', (e) => {
        if(e.target.closest('.calendar-body') || e.target.closest('.modal-content')) return;
        
        if(scrollTimeout) return;
        
        if(e.deltaY > 0) {
            nextBtn.click();
        } else if (e.deltaY < 0) {
            prevBtn.click();
        }
        
        scrollTimeout = setTimeout(() => {
            scrollTimeout = null;
        }, 150);
    });

    function setView(view) {
        currentView = view;
        if(view === 'week') {
            viewWeekBtn.classList.add('active');
            viewMonthBtn.classList.remove('active');
            weekView.classList.replace('hidden-view', 'view-active');
            monthView.classList.replace('view-active', 'hidden-view');
        } else {
            viewMonthBtn.classList.add('active');
            viewWeekBtn.classList.remove('active');
            monthView.classList.replace('hidden-view', 'view-active');
            weekView.classList.replace('view-active', 'hidden-view');
        }
        render();
    }

    function render() {
        if(currentView === 'week') {
            renderWeek();
        } else {
            renderMonth();
        }
    }
    
    function renderWeek() {
        const startOfWeek = getStartOfWeek(currentDate);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        if(startOfWeek.getMonth() === endOfWeek.getMonth()) {
            currentDateDisplay.textContent = `${monthNames[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
        } else {
            currentDateDisplay.textContent = `${monthNames[startOfWeek.getMonth()].substr(0,3)} - ${monthNames[endOfWeek.getMonth()].substr(0,3)} ${startOfWeek.getFullYear()}`;
        }

        if(timeLabelsContainer.children.length === 0) {
            for(let i = 0; i < 24; i++) {
                const timeLabel = document.createElement('div');
                timeLabel.className = 'time-label';
                if (i > 0) timeLabel.textContent = `${i.toString().padStart(2, '0')}:00`;
                timeLabelsContainer.appendChild(timeLabel);
            }
        }
        
        const dayHeaders = document.querySelectorAll('#week-view .day-header');
        const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        
        daysGrid.innerHTML = '';
        const allDayGrid = document.getElementById('all-day-grid');
        if (allDayGrid) allDayGrid.innerHTML = '';
        
        const weekDates = [];
        for(let i = 0; i < 7; i++) {
            const currentDayDate = new Date(startOfWeek);
            currentDayDate.setDate(startOfWeek.getDate() + i);
            weekDates.push(formatDateString(currentDayDate));
            if(dayHeaders[i]) {
                dayHeaders[i].textContent = `${dayNames[i]} ${currentDayDate.getDate()}`;
            }
        }
        
        const multiDayEvents = events.filter(ev => ev.allDay || ev.startDate !== ev.endDate);
        if (allDayGrid) {
            for(let i = 0; i < 7; i++) {
                const dayCol = document.createElement('div');
                dayCol.className = 'all-day-col';
                dayCol.dataset.date = weekDates[i];
                
                dayCol.addEventListener('click', () => {
                    openModal(null, weekDates[i]);
                });
                
                allDayGrid.appendChild(dayCol);
            }
            
            const weekStartStr = weekDates[0];
            const weekEndStr = weekDates[6];
            
            const eventsThisWeek = multiDayEvents.filter(ev => {
                return ev.startDate <= weekEndStr && ev.endDate >= weekStartStr;
            });
            
            eventsThisWeek.sort((a,b) => {
                if (a.startDate === b.startDate) {
                    const spanA = (new Date(a.endDate) - new Date(a.startDate));
                    const spanB = (new Date(b.endDate) - new Date(b.startDate));
                    return spanB - spanA;
                }
                return a.startDate.localeCompare(b.startDate);
            });
            
            const levels = [];
            
            eventsThisWeek.forEach(event => {
                let startDayIndex = weekDates.indexOf(event.startDate);
                if (startDayIndex === -1 && event.startDate < weekStartStr) {
                    startDayIndex = 0;
                }
                
                let endDayIndex = weekDates.indexOf(event.endDate);
                if (endDayIndex === -1 && event.endDate > weekEndStr) {
                    endDayIndex = 6;
                }
                
                const spanDays = endDayIndex - startDayIndex + 1;
                
                let level = 0;
                let placed = false;
                while (!placed) {
                    if (!levels[level]) levels[level] = new Array(7).fill(false);
                    
                    let canPlace = true;
                    for (let i = startDayIndex; i <= endDayIndex; i++) {
                        if (levels[level][i]) {
                            canPlace = false;
                            break;
                        }
                    }
                    
                    if (canPlace) {
                        for (let i = startDayIndex; i <= endDayIndex; i++) {
                            levels[level][i] = true;
                        }
                        placed = true;
                    } else {
                        level++;
                    }
                }
                
                const eventBar = document.createElement('div');
                eventBar.className = 'month-event multi-day';
                const colors = colorMap[event.color] || colorMap['blue'];
                eventBar.style.backgroundColor = colors.bg;
                eventBar.style.borderColor = colors.border;
                eventBar.style.color = colors.text;
                eventBar.textContent = event.title;
                
                eventBar.style.left = `calc((100% / 7) * ${startDayIndex} + 4px)`;
                eventBar.style.width = `calc((100% / 7) * ${spanDays} - 8px)`;
                eventBar.style.top = `${4 + (level * 26)}px`;
                
                if (startDayIndex === 0 && event.startDate < weekStartStr) {
                    eventBar.style.borderTopLeftRadius = '0';
                    eventBar.style.borderBottomLeftRadius = '0';
                    eventBar.style.borderLeft = 'none';
                }
                if (endDayIndex === 6 && event.endDate > weekEndStr) {
                    eventBar.style.borderTopRightRadius = '0';
                    eventBar.style.borderBottomRightRadius = '0';
                }
                
                eventBar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openModal(event);
                });
                
                allDayGrid.appendChild(eventBar);
            });
            
            const requiredHeight = levels.length * 26 + 8;
            if (requiredHeight > 40) {
                allDayGrid.parentElement.style.minHeight = `${requiredHeight}px`;
            } else {
                allDayGrid.parentElement.style.minHeight = '40px';
            }
            
            if (eventsThisWeek.length === 0) {
                allDayGrid.parentElement.style.display = 'none';
            } else {
                allDayGrid.parentElement.style.display = 'grid';
            }
        }

        for(let i = 0; i < 7; i++) {
            const dayStr = weekDates[i];
            
            const dayCol = document.createElement('div');
            dayCol.className = 'day-column';
            dayCol.dataset.date = dayStr;
            
            dayCol.addEventListener('click', (e) => {
                if (e.target.closest('.event-block')) return;
                const rect = dayCol.getBoundingClientRect();
                const y = e.clientY - rect.top;
                let clickedMinute = Math.floor(y);
                clickedMinute = Math.floor(clickedMinute / 30) * 30;
                let hour = Math.floor(clickedMinute / 60);
                let min = clickedMinute % 60;
                let endHour = hour + 1;
                let endMin = min;
                if(endHour > 23) { endHour = 23; endMin = 59; }
                const startTime = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
                const endTime = `${endHour.toString().padStart(2,'0')}:${endMin.toString().padStart(2,'0')}`;
                openModal(null, dayStr, startTime, endTime);
            });
            
            const dayEvents = events.filter(ev => !ev.allDay && ev.startDate === ev.endDate && ev.startDate === dayStr);
            dayEvents.forEach(event => {
                const startMin = timeToMinutes(event.start);
                const endMin = timeToMinutes(event.end);
                if(endMin <= startMin) return;
                const duration = endMin - startMin;
                
                const eventBlock = document.createElement('div');
                eventBlock.className = 'event-block';
                eventBlock.style.top = `${startMin}px`;
                eventBlock.style.height = `${duration}px`;
                
                const colors = colorMap[event.color] || colorMap['blue'];
                eventBlock.style.backgroundColor = colors.bg;
                eventBlock.style.borderLeftColor = colors.border;
                eventBlock.style.color = colors.text;

                eventBlock.innerHTML = `
                    <div class="event-title">${event.title}</div>
                    <div class="event-time">${event.start} - ${event.end}</div>
                `;

                eventBlock.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openModal(event);
                });
                dayCol.appendChild(eventBlock);
            });
            
            daysGrid.appendChild(dayCol);
        }
    }
    
    function renderMonth() {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        currentDateDisplay.textContent = `${monthNames[month]} ${year}`;
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        
        monthGrid.innerHTML = '';
        const todayStr = formatDateString(new Date());

        let dayCounter = 0;
        
        for (let week = 0; week < 6; week++) {
            const weekRow = document.createElement('div');
            weekRow.className = 'month-week-row';
            
            const weekDates = [];
            
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const cell = document.createElement('div');
                cell.className = 'month-day';
                
                let cellDateStr = '';
                
                if (dayCounter < firstDayOfMonth) {
                    const dayNum = daysInPrevMonth - firstDayOfMonth + dayCounter + 1;
                    cell.classList.add('other-month');
                    const prevM = month === 0 ? 11 : month - 1;
                    const prevY = month === 0 ? year - 1 : year;
                    cellDateStr = formatDateString(new Date(prevY, prevM, dayNum));
                    cell.innerHTML = `<div class="day-number">${dayNum}</div>`;
                } else if (dayCounter >= firstDayOfMonth && dayCounter < firstDayOfMonth + daysInMonth) {
                    const dayNum = dayCounter - firstDayOfMonth + 1;
                    cellDateStr = formatDateString(new Date(year, month, dayNum));
                    if (cellDateStr === todayStr) {
                        cell.classList.add('today');
                    }
                    cell.innerHTML = `<div class="day-number">${dayNum}</div>`;
                } else {
                    const dayNum = dayCounter - firstDayOfMonth - daysInMonth + 1;
                    cell.classList.add('other-month');
                    const nextM = month === 11 ? 0 : month + 1;
                    const nextY = month === 11 ? year + 1 : year;
                    cellDateStr = formatDateString(new Date(nextY, nextM, dayNum));
                    cell.innerHTML = `<div class="day-number">${dayNum}</div>`;
                }
                
                weekDates.push(cellDateStr);
                
                cell.addEventListener('click', () => {
                    openModal(null, cellDateStr);
                });
                
                weekRow.appendChild(cell);
                dayCounter++;
            }
            
            const MAX_EVENTS = 3;
            const weekStartStr = weekDates[0];
            const weekEndStr = weekDates[6];
            
            const singleDayEvents = events.filter(ev => !ev.allDay && ev.startDate === ev.endDate);
            const multiDayEvents = events.filter(ev => ev.allDay || ev.startDate !== ev.endDate);
            
            const eventsThisWeekMulti = multiDayEvents.filter(ev => ev.startDate <= weekEndStr && ev.endDate >= weekStartStr);
            const eventsThisWeekSingle = singleDayEvents.filter(ev => ev.startDate >= weekStartStr && ev.startDate <= weekEndStr);
            
            let dayEventCounts = new Array(7).fill(0);
            
            eventsThisWeekMulti.forEach(ev => {
                let sIdx = weekDates.indexOf(ev.startDate); if (sIdx === -1) sIdx = 0;
                let eIdx = weekDates.indexOf(ev.endDate); if (eIdx === -1) eIdx = 6;
                for (let i = sIdx; i <= eIdx; i++) dayEventCounts[i]++;
            });
            eventsThisWeekSingle.forEach(ev => {
                let idx = weekDates.indexOf(ev.startDate);
                if (idx !== -1) dayEventCounts[idx]++;
            });
            
            let maxLevelAllowed = new Array(7);
            for (let i = 0; i < 7; i++) {
                if (dayEventCounts[i] > MAX_EVENTS) {
                    maxLevelAllowed[i] = MAX_EVENTS - 1;
                } else {
                    maxLevelAllowed[i] = MAX_EVENTS;
                }
            }
            
            let hiddenCounts = new Array(7).fill(0);
            const levels = [];
            
            eventsThisWeekMulti.sort((a,b) => {
                if (a.startDate === b.startDate) {
                    const spanA = (new Date(a.endDate) - new Date(a.startDate));
                    const spanB = (new Date(b.endDate) - new Date(b.startDate));
                    return spanB - spanA;
                }
                return a.startDate.localeCompare(b.startDate);
            });
            
            eventsThisWeekMulti.forEach(event => {
                let startDayIndex = weekDates.indexOf(event.startDate);
                if (startDayIndex === -1 && event.startDate < weekStartStr) startDayIndex = 0;
                let endDayIndex = weekDates.indexOf(event.endDate);
                if (endDayIndex === -1 && event.endDate > weekEndStr) endDayIndex = 6;
                
                const spanDays = endDayIndex - startDayIndex + 1;
                
                let level = 0;
                let placed = false;
                while (!placed) {
                    if (!levels[level]) levels[level] = new Array(7).fill(false);
                    let canPlace = true;
                    for (let i = startDayIndex; i <= endDayIndex; i++) {
                        if (levels[level][i]) { canPlace = false; break; }
                    }
                    if (canPlace) {
                        let exceeds = false;
                        for (let i = startDayIndex; i <= endDayIndex; i++) {
                            if (level >= maxLevelAllowed[i]) { exceeds = true; break; }
                        }
                        if (exceeds) {
                            for (let i = startDayIndex; i <= endDayIndex; i++) {
                                hiddenCounts[i]++;
                            }
                            event._hidden = true;
                            placed = true;
                        } else {
                            for (let i = startDayIndex; i <= endDayIndex; i++) {
                                levels[level][i] = true;
                            }
                            event._level = level;
                            placed = true;
                        }
                    } else {
                        level++;
                    }
                }
                
                if (!event._hidden) {
                    const eventBar = document.createElement('div');
                    eventBar.className = 'month-event multi-day';
                    const colors = colorMap[event.color] || colorMap['blue'];
                    eventBar.style.backgroundColor = colors.bg;
                    eventBar.style.borderColor = colors.border;
                    eventBar.style.color = colors.text;
                    eventBar.textContent = event.title;
                    
                    eventBar.style.left = `calc(${startDayIndex} * ((100% - 48px) / 7 + 8px) + 4px)`;
                    eventBar.style.width = `calc(${spanDays} * ((100% - 48px) / 7) + ${spanDays - 1} * 8px - 8px)`;
                    eventBar.style.top = `${36 + (event._level * 26)}px`;
                    
                    if (startDayIndex === 0 && event.startDate < weekStartStr) {
                        eventBar.style.borderTopLeftRadius = '0';
                        eventBar.style.borderBottomLeftRadius = '0';
                        eventBar.style.borderLeft = 'none';
                    }
                    if (endDayIndex === 6 && event.endDate > weekEndStr) {
                        eventBar.style.borderTopRightRadius = '0';
                        eventBar.style.borderBottomRightRadius = '0';
                    }
                    
                    eventBar.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openModal(event);
                    });
                    
                    weekRow.appendChild(eventBar);
                }
            });
            
            for (let i = 0; i < 7; i++) {
                const daySingleEvents = eventsThisWeekSingle.filter(ev => ev.startDate === weekDates[i]);
                daySingleEvents.sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
                
                let currentLevel = 0;
                daySingleEvents.forEach(event => {
                    while (levels[currentLevel] && levels[currentLevel][i]) {
                        currentLevel++;
                    }
                    if (currentLevel < maxLevelAllowed[i]) {
                        if (!levels[currentLevel]) levels[currentLevel] = new Array(7).fill(false);
                        levels[currentLevel][i] = true;
                        
                        const eventBadge = document.createElement('div');
                        eventBadge.className = 'month-event single-day';
                        const colors = colorMap[event.color] || colorMap['blue'];
                        eventBadge.style.backgroundColor = colors.bg;
                        eventBadge.style.borderColor = colors.border;
                        eventBadge.style.color = colors.text;
                        eventBadge.textContent = `${event.start} ${event.title}`;
                        
                        eventBadge.style.left = `calc(${i} * ((100% - 48px) / 7 + 8px) + 4px)`;
                        eventBadge.style.width = `calc(((100% - 48px) / 7) - 8px)`;
                        eventBadge.style.top = `${36 + (currentLevel * 26)}px`;
                        
                        eventBadge.addEventListener('click', (e) => {
                            e.stopPropagation();
                            openModal(event);
                        });
                        
                        weekRow.appendChild(eventBadge);
                    } else {
                        hiddenCounts[i]++;
                    }
                });
                
                if (hiddenCounts[i] > 0) {
                    const moreBtn = document.createElement('div');
                    moreBtn.className = 'month-event more-btn';
                    moreBtn.textContent = `+${hiddenCounts[i]} compromissos`;
                    
                    moreBtn.style.left = `calc(${i} * ((100% - 48px) / 7 + 8px) + 4px)`;
                    moreBtn.style.width = `calc(((100% - 48px) / 7) - 8px)`;
                    moreBtn.style.top = `${36 + (maxLevelAllowed[i] * 26)}px`;
                    
                    moreBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openDayListModal(weekDates[i]);
                    });
                    
                    weekRow.appendChild(moreBtn);
                }
            }
            
            monthGrid.appendChild(weekRow);
        }
    }
    
    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    function openModal(event = null, defaultDateStr = '', defaultStart = '09:00', defaultEnd = '10:00') {
        if (!defaultDateStr) {
            defaultDateStr = formatDateString(new Date());
        }
        
        if (event) {
            modalTitle.textContent = 'Editar Compromisso';
            idInput.value = event.id;
            titleInput.value = event.title;
            dateInput.value = event.startDate;
            endDateInput.value = event.endDate;
            startInput.value = event.start || defaultStart;
            endInput.value = event.end || defaultEnd;
            document.querySelector(`input[name="event-color"][value="${event.color}"]`).checked = true;
            deleteEventBtn.classList.remove('hidden');
            
            allDayCheckbox.checked = event.allDay === true;
        } else {
            modalTitle.textContent = 'Novo Compromisso';
            idInput.value = '';
            titleInput.value = '';
            dateInput.value = defaultDateStr;
            endDateInput.value = defaultDateStr;
            startInput.value = defaultStart;
            endInput.value = defaultEnd;
            document.getElementById('color-blue').checked = true;
            deleteEventBtn.classList.add('hidden');
            
            allDayCheckbox.checked = true;
        }

        allDayCheckbox.dispatchEvent(new Event('change'));

        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
        eventForm.reset();
        if (returnToDayListDate) {
            openDayListModal(returnToDayListDate);
            returnToDayListDate = null;
        }
    }

    cancelModalBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    eventForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const id = idInput.value;
        const title = titleInput.value.trim();
        const startDate = dateInput.value;
        const endDate = endDateInput.value;
        const start = startInput.value;
        const end = endInput.value;
        const color = document.querySelector('input[name="event-color"]:checked').value;
        const allDay = allDayCheckbox.checked;
        
        if (!title || !startDate || !endDate || (!allDay && (!start || !end))) return;

        if (startDate > endDate) {
            alert('A data de término não pode ser anterior à data de início.');
            return;
        }

        if (!allDay && startDate === endDate && timeToMinutes(end) <= timeToMinutes(start)) {
            alert('O horário de fim deve ser posterior ao horário de início.');
            return;
        }

        if (id) {
            const index = events.findIndex(ev => ev.id === id);
            if(index > -1) {
                events[index] = { id, title, startDate, endDate, start, end, color, allDay };
            }
        } else {
            const newEvent = {
                id: Date.now().toString(),
                title,
                startDate,
                endDate,
                start,
                end,
                color,
                allDay
            };
            events.push(newEvent);
        }

        saveEvents();
        closeModal();
    });

    deleteEventBtn.addEventListener('click', () => {
        confirmModal.classList.remove('hidden');
    });

    cancelConfirmBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    confirmDeleteBtn.addEventListener('click', () => {
        const id = idInput.value;
        if(id) {
            events = events.filter(ev => ev.id !== id);
            saveEvents();
            confirmModal.classList.add('hidden');
            closeModal();
        }
    });

    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            confirmModal.classList.add('hidden');
        }
    });

    const dayListModal = document.getElementById('day-list-modal');
    dayListModal.addEventListener('click', (e) => {
        if (e.target === dayListModal) {
            dayListModal.classList.add('hidden');
        }
    });

    document.getElementById('close-day-list').addEventListener('click', () => {
        dayListModal.classList.add('hidden');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!confirmModal.classList.contains('hidden')) {
                confirmModal.classList.add('hidden');
            } else if (!dayListModal.classList.contains('hidden')) {
                dayListModal.classList.add('hidden');
            } else if (!modal.classList.contains('hidden')) {
                closeModal();
            }
        }
    });

    function openDayListModal(dateStr) {
        const dateObj = new Date(dateStr + 'T12:00:00');
        document.getElementById('day-list-weekday').textContent = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        document.getElementById('day-list-date').textContent = dateObj.getDate();
        
        const dayListBody = document.getElementById('day-list-body');
        dayListBody.innerHTML = '';
        
        const singleDayEvents = events.filter(ev => !ev.allDay && ev.startDate === ev.endDate && ev.startDate === dateStr);
        const multiDayEvents = events.filter(ev => ev.allDay || ev.startDate !== ev.endDate).filter(ev => ev.startDate <= dateStr && ev.endDate >= dateStr);
        
        multiDayEvents.sort((a,b) => {
            if (a.startDate === b.startDate) {
                return (new Date(b.endDate) - new Date(b.startDate)) - (new Date(a.endDate) - new Date(a.startDate));
            }
            return a.startDate.localeCompare(b.startDate);
        });
        
        singleDayEvents.sort((a,b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        
        const renderBadge = (event, isAllDay) => {
            const badge = document.createElement('div');
            badge.className = 'month-event';
            const colors = colorMap[event.color] || colorMap['blue'];
            badge.style.backgroundColor = colors.bg;
            badge.style.borderColor = colors.border;
            badge.style.color = colors.text;
            badge.style.position = 'relative';
            badge.style.height = 'auto';
            badge.style.whiteSpace = 'normal';
            badge.style.marginBottom = '4px';
            badge.style.padding = '6px 8px';
            badge.style.width = '100%';
            badge.style.boxSizing = 'border-box';
            
            if (isAllDay) {
                badge.textContent = event.title;
            } else {
                badge.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${colors.bg}; margin-right:8px;"></span>${event.start} ${event.title}`;
                badge.style.backgroundColor = 'transparent';
                badge.style.borderLeft = 'none';
                badge.style.color = 'var(--text-primary)';
                badge.style.paddingLeft = '0';
            }
            
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                dayListModal.classList.add('hidden');
                returnToDayListDate = dateStr;
                openModal(event);
            });
            return badge;
        };
        
        multiDayEvents.forEach(ev => dayListBody.appendChild(renderBadge(ev, true)));
        singleDayEvents.forEach(ev => dayListBody.appendChild(renderBadge(ev, false)));
        
        dayListModal.classList.remove('hidden');
    }

    render();
});
