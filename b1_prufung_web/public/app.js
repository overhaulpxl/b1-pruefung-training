// ── Settings & Constants ──────────────────────────────────────────────────
const TOTAL_WAKTU = 65 * 60; 
const TEIL_COLOR = { 1: "#2980b9", 2: "#27ae60", 3: "#8e44ad", 4: "#d35400", 5: "#c0392b" };

const INSTRUCT = {
    "richtig_falsch_2": "Lesen Sie den Text und die Aufgaben dazu.\nWählen Sie: Sind die Aussagen Richtig oder Falsch?",
    "pilihan_ganda": "Lesen Sie den Text. Wählen Sie die richtige Antwort a, b oder c.",
    "zuordnung": "Lesen Sie die Situationen. Welche Anzeige passt?\nWählen Sie den richtigen Buchstaben (a–j) oder 0 = keine passende Anzeige.",
    "ja_nein": "Lesen Sie die Leserbriefe.\nFindet die Person, dass Einzelkinder es besser haben? Wählen Sie: Ja oder Nein."
};

let soal_data = {};

// ── State ───────────────────────────────────────────────────────────────────
let state = {
    activeModule: null,
    paketName: "Lesen - Paket 1",
    soalList: [],
    sections: [],
    currentSec: 0,
    hasil: {}, // { soal_id : { benar: boolean, jawaban: string } }
    highlights: {}, // { teilId: [ { rangeData, comment } ] }
    timerData: {
        sisaWaktu: TOTAL_WAKTU,
        intervalId: null,
        aktif: false
    },
    selesaiFlag: false,
    fontScale: 1.0
};
let currentSelection = null; 

// ── UI Elements ─────────────────────────────────────────────────────────────
const UI = {
    paketSelector: document.getElementById('paketSelector'),
    paketName: document.getElementById('paketName'),
    paketDropdown: document.getElementById('paketDropdown'),
    
    timerDisplay: document.getElementById('timerDisplay'),
    btnZoomIn: document.getElementById('btnZoomIn'),
    btnZoomOut: document.getElementById('btnZoomOut'),
    
    sectTitleLabel: document.getElementById('sectTitleLabel'),
    instructLabel: document.getElementById('instructLabel'),
    answeredLabel: document.getElementById('answeredLabel'),
    
    mainBody: document.getElementById('mainBody'),
    leftPanel: document.getElementById('leftPanel'),
    rightPanel: document.getElementById('rightPanel'),
    readingText: document.getElementById('readingText'),
    questionsContainer: document.getElementById('questionsContainer'),
    btnRestart: document.getElementById('btnRestart'),
    
    goetheTray: document.getElementById('goetheTray'),
    trayCards: document.getElementById('trayCards'),
    btnDotsToggle: document.getElementById('btnDotsToggle'),
    btnPrevFloat: document.getElementById('btnPrevFloat'),
    btnNextFloat: document.getElementById('btnNextFloat'),
    
    highlightPopup: document.getElementById('highlightPopup'),
    highlightComment: document.getElementById('highlightComment'),
    hkCancelBtn: document.getElementById('hkCancelBtn'),
    hkSaveBtn: document.getElementById('hkSaveBtn'),
    
    recapBody: document.getElementById('recapBody'),
    recapText: document.getElementById('recapText'),
    confirmModal: document.getElementById('confirmModal'),
    modalBtnCancel: document.getElementById('modalBtnCancel'),
    modalBtnConfirm: document.getElementById('modalBtnConfirm')
};

// ── Initialization ──────────────────────────────────────────────────────────
async function initApp() {
    try {
        const response = await fetch('soal_data.json');
        if (!response.ok) throw new Error('Network response was not ok');
        soal_data = await response.json();
        
        // Extract unique pakets (stripping "Lesen - " or "Schreiben - ")
        let paketSet = new Set();
        for(let key in soal_data) {
            let parts = key.split(' - ');
            if(parts.length > 1) {
                // If it's something like "Lesen - Paket 1 (default)"
                // parts.slice(1).join(' - ') gives "Paket 1 (default)"
                paketSet.add(parts.slice(1).join(' - '));
            } else {
                paketSet.add(key);
            }
        }
        
        const portalSelect = document.getElementById('portalPaketSelect');
        portalSelect.innerHTML = '';
        paketSet.forEach(p => {
             let opt = document.createElement('option');
             // Dropdown value is exactly what we stripped, e.g., "Paket 1 (default)"
             opt.value = p; opt.textContent = p;
             portalSelect.appendChild(opt);
        });
        
        let activeSession = localStorage.getItem('b1_active_session');
        let activeModule = localStorage.getItem('b1_active_module');
        
        if (activeSession && activeModule && soal_data[activeSession]) {
            // Restore dropdown selector to match the saved session
            let parts = activeSession.split(' - ');
            if (parts.length > 1) {
                portalSelect.value = parts.slice(1).join(' - ');
            } else {
                portalSelect.value = activeSession;
            }
            startModule(activeModule);
        } else {
            showPortal();
        }
        
        attachListeners();
        attachHighlighter();
    } catch (error) {
        console.error('Failed to fetch soal data:', error);
        alert('Gagal memuat data kuis. Pastikan server berjalan.');
    }
}

function showPortal() {
    state.activeModule = null;
    document.querySelector('.top-header').style.display = 'none';
    document.querySelector('.bottom-bar').style.display = 'none';
    UI.mainBody.style.display = 'none';
    UI.recapBody.style.display = 'none';
    document.getElementById('layoutControls').style.display = 'none';
    
    // Hide floating arrows on the portal
    if (UI.btnPrevFloat) UI.btnPrevFloat.style.display = 'none';
    if (UI.btnNextFloat) UI.btnNextFloat.style.display = 'none';
    
    document.getElementById('portalBody').style.display = 'flex';
}

window.startModule = function(moduleName) {
    let selPaketOriginal = document.getElementById('portalPaketSelect').value;
    state.activeModule = moduleName;
    
    // We try to find the exact matching key in soal_data
    let prefix = moduleName === 'lesen' ? 'Lesen - ' : 'Schreiben - ';
    
    // 1. Try exact match from dropdown (e.g., "Lesen - Paket 1 (default)")
    let fullKey = prefix + selPaketOriginal;
    
    // 2. Try stripping "(default)" if it's there
    if (!soal_data[fullKey]) {
        let strippedName = selPaketOriginal.replace(/ \(default\)$/, '');
        fullKey = prefix + strippedName;
    }
    
    // 3. Try appending "(default)" if it's missing (edge case)
    if (!soal_data[fullKey]) {
        let appendedName = selPaketOriginal + " (default)";
        fullKey = prefix + appendedName;
    }
    
    if (!soal_data[fullKey]) {
        alert(`Maaf, modul ${moduleName.toUpperCase()} untuk set ${selPaketOriginal} belum tersedia.\n(Kunci tidak ditemukan di database)`);
        return;
    }
    
    // Save active session for page reloads
    localStorage.setItem('b1_active_session', fullKey);
    localStorage.setItem('b1_active_module', moduleName);
    
    document.querySelector('.top-header').style.display = 'flex';
    document.querySelector('.bottom-bar').style.display = 'flex';
    document.getElementById('portalBody').style.display = 'none';
    document.getElementById('layoutControls').style.display = 'flex';
    
    initPaketDropdownForModule(moduleName);
    loadPaket(fullKey);
};

function initPaketDropdownForModule(moduleName) {
    UI.paketDropdown.innerHTML = '';
    let prefix = moduleName === 'lesen' ? 'Lesen - ' : 'Schreiben - ';
    for (let pName in soal_data) {
        if (!pName.startsWith(prefix)) continue;
        
        let div = document.createElement('div');
        div.className = 'dropdown-item';
        div.textContent = pName.replace(prefix, '');
        div.onclick = (e) => {
            e.stopPropagation();
            if(!state.selesaiFlag && Object.keys(state.hasil).length > 0) {
                if(!confirm("Anda sedang mengerjakan kuis. Yakin ingin ganti paket?")) return;
            }
            document.activeElement.blur();
            if (pName !== state.paketName) loadPaket(pName);
        };
        UI.paketDropdown.appendChild(div);
    }
}

// (Deleted duplicated initApp block)

function loadPaket(name) {
    if (state.timerData.intervalId) clearInterval(state.timerData.intervalId);
    
    state.paketName = name;
    let prefix = state.activeModule === 'lesen' ? 'Lesen - ' : 'Schreiben - ';
    if (UI.paketName) UI.paketName.textContent = name.replace(prefix, '');
    
    state.soalList = soal_data[name] || [];
    
    let secMap = {};
    state.soalList.forEach(soal => {
        let t = soal.teil;
        if (!secMap[t]) secMap[t] = { teil: t, tipe: soal.tipe, tipe_soal: soal.tipe_soal, soalList: [] };
        secMap[t].soalList.push(soal);
    });
    state.sections = Object.keys(secMap).sort((a,b)=>a-b).map(k => secMap[k]);
    
    // Attempt to load saved state
    let saved = loadStateFromStorage(name);
    if (saved) {
        state.hasil = saved.hasil || {};
        state.highlights = saved.highlights || {};
        state.currentSec = saved.currentSec || 0;
        state.timerData = saved.timerData || { sisaWaktu: TOTAL_WAKTU, intervalId: null, aktif: true };
        state.selesaiFlag = saved.selesaiFlag || false;
    } else {
        state.currentSec = 0;
        state.hasil = {};
        state.highlights = {};
        state.timerData = { sisaWaktu: TOTAL_WAKTU, intervalId: null, aktif: true };
        state.selesaiFlag = false;
    }
    
    UI.mainBody.style.display = 'flex';
    UI.recapBody.style.display = 'none';
    if (UI.btnPrevFloat) UI.btnPrevFloat.style.display = 'none';
    if (UI.btnNextFloat) UI.btnNextFloat.style.display = 'none';
    if (UI.goetheTray) UI.goetheTray.style.display = 'none'; 
    UI.btnRestart.style.display = 'none';
    
    if (state.selesaiFlag) {
        tampilkanRekap();
    } else {
        showSection(state.currentSec);
        if(state.timerData.aktif) mulaiTimer();
    }
}

// ── Rendering Section ───────────────────────────────────────────────────────
function showSection(idx) {
    state.currentSec = idx;
    let sec = state.sections[idx];
    let col = TEIL_COLOR[sec.teil] || "#2563eb";
    
    let mName = state.activeModule ? state.activeModule.charAt(0).toUpperCase() + state.activeModule.slice(1) : 'Lesen';
    UI.sectTitleLabel.textContent = `${mName} ${idx + 1}`;
    UI.sectTitleLabel.style.color = '#333'; // Resetting color just in case, goethe uses standard dark bold text
    UI.instructLabel.innerText = INSTRUCT[sec.tipe_soal] || "";
    
    let textsSeen = [];
    let combinedText = [];
    sec.soalList.forEach(soal => {
        if (!textsSeen.includes(soal.teks)) {
            textsSeen.push(soal.teks); combinedText.push(soal.teks);
        }
    });
    UI.readingText.textContent = combinedText.join('\n\n────────────────────────────────────────\n\n');
    UI.readingText.parentElement.scrollTop = 0;
    
    UI.questionsContainer.innerHTML = '';
    sec.soalList.forEach((soal, sIdx) => {
        UI.questionsContainer.appendChild(createQuestionCard(soal, sec.tipe_soal, sIdx + 1));
    });
    
    if(UI.btnPrevFloat) UI.btnPrevFloat.style.display = (idx === 0) ? 'none' : 'flex';
    
    if(UI.btnNextFloat) {
        UI.btnNextFloat.style.display = 'flex';
        if (idx === state.sections.length - 1) {
            UI.btnNextFloat.innerHTML = '⏹';
            UI.btnNextFloat.title = 'Selesai';
            UI.btnNextFloat.onclick = () => attemptFinish();
        } else {
            UI.btnNextFloat.innerHTML = '►';
            UI.btnNextFloat.title = 'Weiter';
            UI.btnNextFloat.onclick = () => { if (state.currentSec < state.sections.length - 1) showSection(state.currentSec + 1); };
        }
    }
    
    updateTray();
    updateAnsweredLabel();
    UI.rightPanel.scrollTop = 0;
    restoreHighlights();
    saveStateToStorage();
}

function updateTray() {
    if (!UI.trayCards) return;
    UI.trayCards.innerHTML = '';
    
    state.sections.forEach((sec, i) => {
        let card = document.createElement('div');
        card.className = 'tray-card';
        if (i === state.currentSec) card.classList.add('active');
        
        // Header
        let header = document.createElement('div');
        header.className = 'tray-card-header';
        let mName = state.activeModule ? state.activeModule.charAt(0).toUpperCase() + state.activeModule.slice(1) : 'Lesen';
        header.textContent = `${mName} ${i + 1}`;
        header.onclick = () => {
            showSection(i);
            UI.goetheTray.style.display = 'none'; // Close tray after selecting
        };
        card.appendChild(header);
        
        // Tasks
        let body = document.createElement('div');
        body.className = 'tray-card-body';
        sec.soalList.forEach((soal, sIdx) => {
            let taskItem = document.createElement('div');
            taskItem.className = 'tray-task-item';
            
            // Check if answered
            if (state.hasil[soal.id]) {
                taskItem.classList.add('done');
            }
            
            let box = document.createElement('div');
            box.className = 'tray-task-box';
            
            let lbl = document.createElement('span');
            lbl.textContent = `Aufgabe ${sIdx + 1}`;
            
            taskItem.appendChild(box);
            taskItem.appendChild(lbl);
            body.appendChild(taskItem);
        });
        
        card.appendChild(body);
        UI.trayCards.appendChild(card);
    });
}

function updateAnsweredLabel() {
    UI.answeredLabel.innerHTML = `Arbeitszeit: ${Math.round(TOTAL_WAKTU/60)} Minuten &nbsp;&nbsp;&nbsp; ${state.currentSec + 1} | ${state.sections.length}`;
}

// ── Question Component ──────────────────────────────────────────────────────
function createQuestionCard(soal, tipe_soal, num) {
    let card = document.createElement('div');
    card.className = 'question-card';
    
    let qText = document.createElement('div');
    qText.className = 'q-text';
    qText.style.fontSize = `${Math.max(14, 16 * state.fontScale)}px`;
    
    // The source data already contains the numbering (1-30) and prefix
    qText.innerText = soal.pertanyaan;
    card.appendChild(qText);
    
    let storedAnswer = state.hasil[soal.id] ? state.hasil[soal.id].jawaban : null;
    
    if (tipe_soal === "essay") {
        let editor = document.createElement('textarea');
        editor.className = 'schreiben-editor';
        editor.placeholder = "Hier schreiben...";
        if (storedAnswer) editor.value = storedAnswer;
        
        let wordCountDiv = document.createElement('div');
        wordCountDiv.className = 'word-count';
        
        card.appendChild(editor);
        card.appendChild(wordCountDiv);
        
        const countWords = (text) => text.trim().split(/\s+/).filter(w => w.length > 0).length;
        
        const updateCount = () => {
            let sTeil = String(soal.teil);
            let limit = (sTeil === '1' || sTeil === '2') ? 80 : 40;
            let c = countWords(editor.value);
            wordCountDiv.innerText = `Wortanzahl: ${c} / ${limit}`;
            if (c < limit) {
                wordCountDiv.className = 'word-count merah';
            } else {
                wordCountDiv.className = 'word-count hijau';
            }
        };
        
        editor.addEventListener('input', () => {
            state.hasil[soal.id] = { benar: true, jawaban: editor.value };
            updateCount();
            updateAnsweredLabel();
            saveStateToStorage();
        });
        
        updateCount(); 
    }
    else if (tipe_soal === "richtig_falsch_2" || tipe_soal === "ja_nein") {
        let btnContainer = document.createElement('div');
        btnContainer.className = 'binary-options';
        
        for (let key in soal.pilihan) {
            let labelText = soal.pilihan[key];
            let btn = document.createElement('button');
            btn.className = 'btn-binary';
            btn.style.fontSize = `${Math.max(13, 15 * state.fontScale)}px`;
            btn.innerHTML = labelText;
            btn.dataset.key = String(key);
            
            if (storedAnswer === key) btn.classList.add('selected');
            btn.onclick = () => handleAnswer(soal, key, btnContainer, 'binary');
            btnContainer.appendChild(btn);
        }
        card.appendChild(btnContainer);
    } 
    else {
        let mcContainer = document.createElement('div');
        mcContainer.className = 'mc-options';
        
        for (let key in soal.pilihan) {
            let labelText = soal.pilihan[key];
            let optDiv = document.createElement('div');
            optDiv.className = 'mc-option';
            optDiv.dataset.key = String(key);
            if (storedAnswer === key) optDiv.classList.add('selected');
            
            let dot = document.createElement('div');
            dot.className = 'mc-dot';
            let lbl = document.createElement('div');
            lbl.className = 'mc-label';
            lbl.style.fontSize = `${Math.max(13, 15 * state.fontScale)}px`;
            lbl.innerText = labelText;
            
            optDiv.appendChild(dot);
            optDiv.appendChild(lbl);
            
            optDiv.onclick = () => handleAnswer(soal, key, mcContainer, 'mc');
            mcContainer.appendChild(optDiv);
        }
        card.appendChild(mcContainer);
    }
    
    return card;
}

function handleAnswer(soal, key, container, type) {
    state.hasil[soal.id] = { benar: (key === soal.jawaban_benar), jawaban: key };
    Array.from(container.children).forEach(child => child.classList.remove('selected'));
    
    let selectedEl = Array.from(container.children).find(el => el.dataset.key === String(key));
    if(selectedEl) selectedEl.classList.add('selected');
    
    updateAnsweredLabel();
    saveStateToStorage();
}

// ── Highlighter ─────────────────────────────────────────────────────────────
function attachHighlighter() {
    UI.readingText.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', (e) => {
        if (!UI.highlightPopup.contains(e.target) && e.target !== UI.readingText) {
            UI.highlightPopup.style.display = 'none';
        }
    });

    UI.hkCancelBtn.onclick = () => {
        UI.highlightPopup.style.display = 'none';
        currentSelection = null;
        window.getSelection().removeAllRanges();
    };

    UI.hkSaveBtn.onclick = () => {
        if (currentSelection) {
            let secId = state.sections[state.currentSec].teil;
            if (!state.highlights[secId]) state.highlights[secId] = [];
            state.highlights[secId].push({
                start: currentSelection.start, end: currentSelection.end,
                text: currentSelection.text, comment: UI.highlightComment.value
            });
            state.highlights[secId].sort((a,b) => a.start - b.start);
            
            UI.highlightPopup.style.display = 'none';
            currentSelection = null;
            window.getSelection().removeAllRanges();
            restoreHighlights(); 
            saveStateToStorage();
        }
    };
}

function handleTextSelection(e) {
    let sel = window.getSelection();
    if (!sel.isCollapsed && UI.readingText.contains(sel.anchorNode)) {
        let range = sel.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        
        let preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(UI.readingText);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        let start = preSelectionRange.toString().length;
        let text = range.toString();
        if(text.trim().length === 0) return;

        currentSelection = { start: start, end: start + text.length, text: text };
        UI.highlightComment.value = "";
        UI.highlightPopup.style.left = `${rect.left + window.scrollX}px`;
        UI.highlightPopup.style.top = `${rect.top + window.scrollY - 100}px`;
        UI.highlightPopup.style.display = 'block';
    }
}

function restoreHighlights() {
    let secId = state.sections[state.currentSec].teil;
    let hlData = state.highlights[secId];
    
    let rawText = [];
    let textsSeen = [];
    state.sections[state.currentSec].soalList.forEach(soal => {
        if (!textsSeen.includes(soal.teks)) { textsSeen.push(soal.teks); rawText.push(soal.teks); }
    });
    let fullRawStr = rawText.join('\n\n────────────────────────────────────────\n\n');
    
    if (!hlData || hlData.length === 0) {
        UI.readingText.textContent = fullRawStr; return;
    }

    let parsedHTML = ""; let lastIndex = 0;
    hlData.forEach(hl => {
        if(hl.start < lastIndex) return;
        parsedHTML += escapeHTML(fullRawStr.substring(lastIndex, hl.start));
        parsedHTML += `<span class="h-text" title="${escapeHTML('Komentar: ' + hl.comment)}">${escapeHTML(fullRawStr.substring(hl.start, hl.end))}</span>`;
        lastIndex = hl.end;
    });
    parsedHTML += escapeHTML(fullRawStr.substring(lastIndex));
    UI.readingText.innerHTML = parsedHTML;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}

// ── Timer & Zoom ────────────────────────────────────────────────────────────
function mulaiTimer() {
    updateTimerDisplay();
    state.timerData.intervalId = setInterval(() => {
        if (!state.timerData.aktif) return clearInterval(state.timerData.intervalId);
        state.timerData.sisaWaktu--;
        updateTimerDisplay();
        
        // Save timer state roughly every 5 seconds to avoid over-writing
        if (state.timerData.sisaWaktu % 5 === 0) saveStateToStorage();
        
        if (state.timerData.sisaWaktu <= 0) {
            clearInterval(state.timerData.intervalId);
            state.timerData.aktif = false;
            alert("⏰ Waktu habis!");
            selesaiKuis();
        }
    }, 1000);
}

function updateTimerDisplay() {
    let m = Math.floor(state.timerData.sisaWaktu / 60);
    let s = state.timerData.sisaWaktu % 60;
    UI.timerDisplay.textContent = `⏱ ${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    if (state.timerData.sisaWaktu < 300) UI.timerDisplay.classList.add('warning');
    else UI.timerDisplay.classList.remove('warning');
}

function applyZoom(delta) {
    state.fontScale = Math.max(0.7, Math.min(1.6, state.fontScale + delta));
    UI.readingText.style.fontSize = `${Math.max(12, 15 * state.fontScale)}px`;
    
    if (!state.selesaiFlag) {
        document.querySelectorAll('.q-text').forEach(el => el.style.fontSize = `${Math.max(14, 16 * state.fontScale)}px`);
        document.querySelectorAll('.mc-label').forEach(el => el.style.fontSize = `${Math.max(13, 15 * state.fontScale)}px`);
        document.querySelectorAll('.btn-binary').forEach(el => el.style.fontSize = `${Math.max(13, 15 * state.fontScale)}px`);
    } else {
        UI.recapText.style.fontSize = `${Math.max(14, 16 * state.fontScale)}px`;
    }
}

// ── Finishing & Recap ───────────────────────────────────────────────────────
function attemptFinish() {
    let unanswered = state.soalList.length - Object.keys(state.hasil).length;
    if (unanswered > 0) UI.confirmModal.style.display = 'flex';
    else selesaiKuis();
}

function selesaiKuis() {
    UI.confirmModal.style.display = 'none';
    if (state.selesaiFlag) return;
    
    state.selesaiFlag = true;
    state.timerData.aktif = false;
    if(state.timerData.intervalId) clearInterval(state.timerData.intervalId);
    
    saveStateToStorage();
    tampilkanRekap();
}

function tampilkanRekap() {
    let total = state.soalList.length;
    let isSchreiben = state.activeModule === 'schreiben';
    let skor = Object.values(state.hasil).filter(v => v.benar).length;
    let pct = Math.round((skor / total) * 100);
    
    let status = isSchreiben ? "Kriteria Penilaian: Aufgabenerfüllung, Kohärenz, Wortschatz, Strukturen (Grammatik)" : (pct >= 60 ? "BESTANDEN (Lulus) 🎉" : "NICHT BESTANDEN (Belum Lulus) 💪");
    
    UI.mainBody.style.display = 'none';
    UI.recapBody.style.display = 'block';
    
    if (UI.btnPrevFloat) UI.btnPrevFloat.style.display = 'none';
    if (UI.btnNextFloat) UI.btnNextFloat.style.display = 'none';
    if (UI.goetheTray) UI.goetheTray.style.display = 'none';
    if (UI.btnDotsToggle) UI.btnDotsToggle.style.display = 'none';
    
    UI.btnRestart.style.display = 'block';
    
    UI.sectTitleLabel.innerHTML = '✅ Rekapitulasi Akhir';
    UI.instructLabel.innerText = '';
    
    if (isSchreiben) {
         UI.answeredLabel.textContent = `Status: ${status}`;
    } else {
         UI.answeredLabel.textContent = `Skor: ${skor}/${total} (${pct}%) — ${status}`;
    }
    
    let html = `
        <div class="recap-header">
            <h2>REKAPITULASI AKHIR · B1 ${isSchreiben ? 'Schreiben' : 'Lesen'}</h2>
            ${isSchreiben ? `
            <div class="schreiben-criteria-grid">
                <div class="criteria-card">
                    <div class="c-icon">🎯</div>
                    <div class="c-title">Aufgabenerfüllung</div>
                    <div class="c-desc">Pemenuhan Tugas</div>
                </div>
                <div class="criteria-card">
                    <div class="c-icon">🔗</div>
                    <div class="c-title">Kohärenz</div>
                    <div class="c-desc">Kepaduan Teks</div>
                </div>
                <div class="criteria-card">
                    <div class="c-icon">📝</div>
                    <div class="c-title">Wortschatz</div>
                    <div class="c-desc">Kosa Kata</div>
                </div>
                <div class="criteria-card">
                    <div class="c-icon">⚙️</div>
                    <div class="c-title">Strukturen</div>
                    <div class="c-desc">Tata Bahasa</div>
                </div>
            </div>
            <div class="schreiben-footer-info">Teks Anda siap dinilai instruktur berdasarkan 4 kriteria Goethe-Zertifikat di atas.</div>
            ` : `
            <div class="recap-scorecard ${pct >= 60 ? 'pass' : 'fail'}">
                <div class="score-main">Skor: ${skor} / ${total}</div>
                <div class="score-pct">Nilai: ${pct}%</div>
                <div class="score-status">${status}</div>
            </div>
            `}
        </div>
        <div class="recap-grid">
    `;
    
    let cur_teil = null;
    state.soalList.forEach((soal, index) => {
        if (soal.teil !== cur_teil) {
            cur_teil = soal.teil;
            html += `<h3 class="recap-teil-title">${soal.tipe}</h3>`;
        }
        
        let info = state.hasil[soal.id];
        let firstLine = soal.pertanyaan.split('\\n')[0];
        
        if (!info) {
            html += `
            <div class="recap-card skip">
                <div class="rc-header">
                    <span class="rc-icon">⬜</span>
                    <span class="rc-qtext">${firstLine}</span>
                </div>
                <div class="rc-body">
                    <span class="rc-badge none">Nicht beantwortet</span>
                </div>
            </div>`;
            return;
        }
        
        let isEssay = soal.tipe_soal === 'essay';
        let benar = info.benar;
        let cName = isEssay ? "benar" : (benar ? "benar" : "salah");
        let icon = isEssay ? "✍️" : (benar ? "✅" : "❌");
        
        html += `
        <div class="recap-card ${cName}">
            <div class="rc-header">
                <span class="rc-icon">${icon}</span>
                <span class="rc-qtext">${firstLine}</span>
            </div>
            <div class="rc-body">`;
            
        if (isEssay) {
             let c = info.jawaban.trim().split(/\s+/).filter(w => w.length > 0).length;
             html += `
                 <div class="rc-answers" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                     <div class="rc-badge none">Wortanzahl: <strong>${c}</strong></div>
                     <div style="white-space: pre-wrap; background: white; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; width: 100%; font-family: sans-serif; font-size: 15px;">${info.jawaban}</div>
                 </div>`;
        } else if (!benar) {
            html += `
                <div class="rc-answers">
                    <span class="rc-badge wrong">Ihre Antwort: <strong>${info.jawaban.toUpperCase()}</strong></span>
                    <span class="rc-badge right">Richtig: <strong>${soal.jawaban_benar.toUpperCase()}</strong></span>
                </div>`;
        }
        
        html += `
                <div class="rc-explain">💡 ${soal.pembahasan}</div>`;
                
        if (soal.highlight) {
            html += `<div class="rc-quote">🔍 “${soal.highlight}”</div>`;
        }
        
        html += `
            </div>
        </div>`;
    });
    
    html += `</div>`;
    
    UI.recapText.innerHTML = html;
}

function attachListeners() {
    if(UI.btnPrevFloat) UI.btnPrevFloat.onclick = () => { if(state.currentSec > 0) showSection(state.currentSec - 1); };
    // btnNextFloat onclick is bound dynamically in showSection() depending on the page index.
    
    UI.btnDotsToggle.onclick = () => {
        if(!UI.goetheTray) return;
        let isVis = UI.goetheTray.style.display === 'flex';
        
        if (isVis) {
            UI.goetheTray.classList.add('slide-down');
            setTimeout(() => {
                UI.goetheTray.style.display = 'none';
                UI.goetheTray.classList.remove('slide-down');
            }, 300);
        } else {
            UI.goetheTray.style.display = 'flex';
            updateTray();
        }
    };
    
    // Internal tray arrows (just scroll the cards container, or switch pages?)
    let trayPrev = document.getElementById('trayPrev');
    let trayNext = document.getElementById('trayNext');
    if(trayPrev) trayPrev.onclick = () => { UI.trayCards.scrollBy({left: -200, behavior: 'smooth'}); };
    if(trayNext) trayNext.onclick = () => { UI.trayCards.scrollBy({left: 200, behavior: 'smooth'}); };
    
    UI.btnZoomIn.onclick = () => applyZoom(0.1);
    UI.btnZoomOut.onclick = () => applyZoom(-0.1);
    
    UI.btnRestart.onclick = () => {
        if (confirm("Mulai ulang dari awal? Semua histori jawaban dan sisa waktu untuk paket ini akan dihapus.")) {
            localStorage.removeItem('b1_prufung_state_' + state.paketName);
            location.reload();
        }
    };
    
    UI.modalBtnCancel.onclick = () => UI.confirmModal.style.display = 'none';
    UI.modalBtnConfirm.onclick = selesaiKuis;
    
    document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            setLayout(e.target.dataset.layout);
        });
    });
}

function setLayout(mode) {
    if (!UI.leftPanel || !UI.rightPanel) return;
    
    UI.leftPanel.className = 'left-panel';
    UI.rightPanel.className = 'right-panel';
    
    if (mode === 'left-heavy') {
        UI.leftPanel.classList.add('flex-70');
        UI.rightPanel.classList.add('flex-30');
    } else if (mode === 'right-heavy') {
        UI.leftPanel.classList.add('flex-30');
        UI.rightPanel.classList.add('flex-70');
    } else {
        UI.leftPanel.classList.add('flex-50');
        UI.rightPanel.classList.add('flex-50');
    }
}

// ── LocalStorage State Sync ─────────────────────────────────────────────────
function saveStateToStorage() {
    if (!state.paketName) return;
    try {
        localStorage.setItem('b1_prufung_state_' + state.paketName, JSON.stringify({
            hasil: state.hasil,
            timerData: { sisaWaktu: state.timerData.sisaWaktu, aktif: state.timerData.aktif, intervalId: null },
            currentSec: state.currentSec,
            selesaiFlag: state.selesaiFlag,
            highlights: state.highlights
        }));
    } catch(e) { console.error("Could not save state to localStorage", e); }
}

function loadStateFromStorage(name) {
    try {
        let stored = localStorage.getItem('b1_prufung_state_' + name);
        if (stored) return JSON.parse(stored);
    } catch(e) { console.error("Could not load state from localStorage", e); }
    return null;
}

window.onload = initApp;
