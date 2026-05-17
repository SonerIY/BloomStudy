// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// --- CONFIG & STATE ---
let currentUser = null;

const defaultData = {
    tasks: [],
    mistakes: [],
    stats: {
        totalFocus: 0,
        totalQuestions: 0,
        streak: 0,
        lastActiveDate: null,
        history: {} // "YYYY-MM-DD": minutes
    },
    garden: { flowers: [] },
    sessionHistory: [], // Post-session reports
    internalStats: {
        timerStarts: 0,
        completedSessions: 0,
        tasksAdded: 0,
        mistakesReviewed: 0
    }
};

let userData = null;

// Safe load
try {
    let raw = localStorage.getItem('bloom_v2_data');
    if (raw) {
        userData = JSON.parse(raw);
        if(!userData.mistakes) userData.mistakes = [];
        if(!userData.stats) userData.stats = defaultData.stats;
        if(!userData.stats.history) userData.stats.history = {};
        if(!userData.garden) userData.garden = defaultData.garden;
        if(!userData.garden.flowers) userData.garden.flowers = [];
        if(!userData.sessionHistory) userData.sessionHistory = [];
        if(!userData.internalStats) userData.internalStats = defaultData.internalStats;
    } else {
        userData = JSON.parse(JSON.stringify(defaultData));
    }
} catch(e) {
    userData = JSON.parse(JSON.stringify(defaultData));
}

// Update Daily Streak & History
const todayStr = new Date().toISOString().split('T')[0];
if (!userData.stats.history[todayStr]) userData.stats.history[todayStr] = 0;

if (userData.stats.lastActiveDate !== todayStr) {
    let yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    let yesterdayStr = yesterday.toISOString().split('T')[0];
    if (userData.stats.lastActiveDate === yesterdayStr) userData.stats.streak += 1;
    else if (userData.stats.lastActiveDate !== todayStr) userData.stats.streak = 1;
    userData.stats.lastActiveDate = todayStr;
}

function saveData() {
    localStorage.setItem('bloom_v2_data', JSON.stringify(userData));
    if(window.pushProfileToCloud) window.pushProfileToCloud(userData);
    updateUI();
}

function trackStat(key) {
    if(userData.internalStats[key] !== undefined) {
        userData.internalStats[key]++;
        saveData();
    }
}

// --- SECURITY (XSS PREVENTION) ---
function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- DOM ELEMENTS & NAVIGATION ---
const navBtns = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

function switchTab(tabId) {
    navBtns.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    let targetBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if(targetBtn) targetBtn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    const sidebarNav = document.querySelector('.sidebar-nav');
    if(window.innerWidth <= 768 && sidebarNav) {
        sidebarNav.classList.remove('menu-open');
    }
}

navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
});

// Mobile Menu Toggle
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        document.querySelector('.sidebar-nav').classList.toggle('menu-open');
    });
}

// Close menu when clicking outside on mobile
document.addEventListener('click', (e) => {
    const sidebarNav = document.querySelector('.sidebar-nav');
    if(window.innerWidth <= 768 && sidebarNav && sidebarNav.classList.contains('menu-open')) {
        if(!sidebarNav.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            sidebarNav.classList.remove('menu-open');
        }
    }
});

// --- ZEN & DARK MODE & SHORTCUTS ---
const zenBtn = document.getElementById('zenModeToggleBtn');
zenBtn.addEventListener('click', () => {
    document.body.classList.toggle('zen-mode');
});

const darkBtn = document.getElementById('darkModeToggleBtn');
// Load saved theme
if(localStorage.getItem('bloom_theme') === 'dark') {
    document.body.classList.add('dark-mode');
}
if(darkBtn) {
    darkBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('bloom_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        document.querySelectorAll('input[type="range"]').forEach(updateSliderFill);
    });
}

const shortcutsModal = document.getElementById('shortcuts-modal');
document.getElementById('openShortcutsBtn').addEventListener('click', () => shortcutsModal.classList.add('active'));
document.getElementById('closeShortcutsBtn').addEventListener('click', () => shortcutsModal.classList.remove('active'));

document.addEventListener('keydown', (e) => {
    // Ignore if typing in input/textarea
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') { e.preventDefault(); document.getElementById('startTimerBtn').click(); }
    if (e.code === 'KeyR') { document.getElementById('resetTimerBtn').click(); }
    if (e.code === 'KeyN') { switchTab('tab-tasks'); document.getElementById('newTaskName').focus(); e.preventDefault(); }
    if (e.code === 'KeyT') { switchTab('tab-mistakes'); }
    if (e.key === '?') { shortcutsModal.classList.toggle('active'); }
});

// --- MODALS (AUTH & POST-SESSION) ---
const authModal = document.getElementById('auth-modal');
if(document.getElementById('openAuthBtn')) document.getElementById('openAuthBtn').addEventListener('click', () => authModal.classList.add('active'));
if(document.getElementById('closeAuthBtn')) document.getElementById('closeAuthBtn').addEventListener('click', () => authModal.classList.remove('active'));

const authError = document.getElementById('auth-error');

// Google Login
document.getElementById('authGoogleBtn').addEventListener('click', async () => {
    if(!window.auth) return authError.textContent = "Firebase yapılandırılmamış.";
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await window.auth.signInWithPopup(provider);
        authModal.classList.remove('active');
    } catch(err) { authError.textContent = err.message; }
});

// Email Login/Register Toggle Logic
let isLoginMode = true;
const authToggleLink = document.getElementById('authToggleLink');
const authToggleText = document.getElementById('authToggleText');
const authSubmitBtn = document.getElementById('authSubmitBtn');

if(authToggleLink) {
    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        if(isLoginMode) {
            authSubmitBtn.textContent = "Giriş Yap";
            authToggleText.textContent = "Hesabınız yok mu?";
            authToggleLink.textContent = "Kayıt Ol";
        } else {
            authSubmitBtn.textContent = "Hesap Oluştur";
            authToggleText.textContent = "Zaten hesabınız var mı?";
            authToggleLink.textContent = "Giriş Yap";
        }
        authError.textContent = "";
    });
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(pw) {
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/.test(pw);
}

const showForgotPasswordBtn = document.getElementById('showForgotPasswordBtn');
const backToLoginBtn = document.getElementById('backToLoginBtn');
const authMainSection = document.getElementById('authMainSection');
const forgotPasswordSection = document.getElementById('forgotPasswordSection');

if(showForgotPasswordBtn && backToLoginBtn) {
    showForgotPasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authMainSection.style.display = 'none';
        forgotPasswordSection.style.display = 'block';
        authError.textContent = "";
    });

    backToLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        forgotPasswordSection.style.display = 'none';
        authMainSection.style.display = 'block';
        authError.textContent = "";
    });
}

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = "";
    let em = document.getElementById('forgotEmail').value.trim();
    if(!validateEmail(em)) {
        authError.style.color = "var(--danger-color)";
        return authError.textContent = "Lütfen geçerli bir e-posta adresi yazın.";
    }
    try {
        await window.auth.sendPasswordResetEmail(em);
        authError.style.color = "var(--success-color)";
        authError.textContent = "Şifre sıfırlama bağlantısı e-posta adresinize gönderildi! (Spam klasörünü de kontrol ediniz.)";
        document.getElementById('forgotPasswordForm').reset();
        setTimeout(() => { 
            authError.style.color = "var(--danger-color)"; 
            authError.textContent = ""; 
            forgotPasswordSection.style.display = 'none';
            authMainSection.style.display = 'block';
        }, 5000);
    } catch(err) {
        authError.style.color = "var(--danger-color)";
        if(err.code === 'auth/user-not-found') authError.textContent = "Bu e-posta adresi sistemde kayıtlı değil.";
        else authError.textContent = "Hata oluştu. Lütfen tekrar deneyin.";
    }
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = "";
    if(!window.auth) return authError.textContent = "Firebase yapılandırılmamış.";
    
    let em = document.getElementById('authEmail').value.trim();
    let pw = document.getElementById('authPassword').value;

    if(!validateEmail(em)) {
        return authError.textContent = "Lütfen geçerli bir e-posta adresi girin. (Örn: isim@gmail.com)";
    }

    try {
        authError.style.color = "var(--danger-color)"; // Reset color
        if(isLoginMode) {
            const userCred = await window.auth.signInWithEmailAndPassword(em, pw);
            if(!userCred.user.emailVerified) {
                await window.auth.signOut();
                return authError.textContent = "Lütfen önce e-posta adresinize gönderilen bağlantıya tıklayarak hesabınızı onaylayın.";
            }
            authModal.classList.remove('active');
            document.getElementById('auth-form').reset();
        } else {
            if(!validatePassword(pw)) {
                return authError.textContent = "Şifreniz en az 8 karakter olmalı, en az 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.";
            }
            const userCred = await window.auth.createUserWithEmailAndPassword(em, pw);
            await userCred.user.sendEmailVerification();
            await window.auth.signOut();
            
            authError.style.color = "var(--success-color)";
            authError.textContent = "Kayıt başarılı! Lütfen e-postanıza (ve Spam'a) gelen linke tıklayarak hesabınızı onaylayın, ardından giriş yapın.";
            
            // Revert back to login mode visually
            isLoginMode = true;
            authSubmitBtn.textContent = "Giriş Yap";
            authToggleText.textContent = "Hesabınız yok mu?";
            authToggleLink.textContent = "Kayıt Ol";
            document.getElementById('authPassword').value = ""; // clear password securely
        }
    } catch(err) {
        if(err.code === 'auth/configuration-not-found') {
            authError.textContent = "Hata kodu: AUTH_CONFIG_ERR - Lütfen daha sonra tekrar deneyin.";
        } else if(err.code === 'auth/email-already-in-use') {
            authError.textContent = "Bu e-posta adresi zaten kullanımda.";
        } else if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            authError.textContent = "E-posta veya şifre hatalı.";
        } else if(err.code === 'auth/user-not-found') {
            authError.textContent = "Bu e-posta adresi ile kayıtlı hesap bulunamadı.";
        } else {
            authError.textContent = err.message;
        }
    }
});

// Guest
document.getElementById('authGuestBtn').addEventListener('click', async () => {
    if(!window.auth) return authModal.classList.remove('active');
    try {
        await window.auth.signInAnonymously();
        authModal.classList.remove('active');
    } catch(err) { authError.textContent = err.message; }
});

// Post-Session
const reportModal = document.getElementById('report-modal');
document.getElementById('closeReportBtn').addEventListener('click', () => reportModal.classList.remove('active'));

document.getElementById('reportForm').addEventListener('submit', (e) => {
    e.preventDefault();
    let q = parseInt(document.getElementById('reportQuestions').value) || 0;
    userData.sessionHistory.push({
        date: new Date().toISOString(),
        efficiency: document.getElementById('reportEfficiency').value,
        questions: q,
        note: document.getElementById('reportNote').value
    });
    
    userData.stats.totalQuestions += q;
    trackStat('completedSessions');
    
    // Add flower reward
    userData.garden.flowers.push({
        x: Math.random() * 90,
        y: Math.random() * 80 + 10,
        scale: 0.5 + Math.random() * 0.7
    });

    saveData();
    reportModal.classList.remove('active');
    document.getElementById('reportForm').reset();
    document.getElementById('reportEfficiency').value = 4;
});


// --- POMODORO ---
let timerInterval;
let timeLeft = 25 * 60;
let isTimerRunning = false;
let currentMode = 'focus'; 

const timeDisplay = document.getElementById('timeDisplay');
const timerLabel = document.getElementById('timerLabel');
const startTimerBtn = document.getElementById('startTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');
const modeToggles = document.querySelectorAll('.mode-toggle');
const activeTaskSelect = document.getElementById('currentActiveTask');
const clockAudioSelect = document.getElementById('clockAudioSelect');
const clockVolume = document.getElementById('clockVolume');

const clockAudioPlayer = new Audio();
clockAudioPlayer.loop = true;

clockAudioSelect.addEventListener('change', (e) => {
    if(!e.target.value) {
        clockAudioPlayer.pause();
        clockAudioPlayer.src = "";
    } else {
        clockAudioPlayer.src = e.target.value;
        if (isTimerRunning) clockAudioPlayer.play().catch(e=>console.log(e));
        else clockAudioPlayer.pause();
    }
});
clockVolume.addEventListener('input', (e) => { clockAudioPlayer.volume = e.target.value; });

function updateTimerDisplay() {
    let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    let s = (timeLeft % 60).toString().padStart(2, '0');
    timeDisplay.textContent = `${m}:${s}`;
    document.title = `${m}:${s} - Bloom`;
}

// --- HYPER FOCUS MODE ---
const hyperFocusBtn = document.getElementById('hyperFocusBtn');
if(hyperFocusBtn) {
    hyperFocusBtn.addEventListener('click', () => {
        document.body.classList.toggle('hyper-focus-mode');
        if(document.body.classList.contains('hyper-focus-mode')) {
            hyperFocusBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        } else {
            hyperFocusBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
        }
    });
}

modeToggles.forEach(btn => {
    btn.addEventListener('click', () => {
        if(isTimerRunning) return;
        modeToggles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
        
        if (currentMode === 'focus') { timeLeft = 25 * 60; timerLabel.textContent = "Odak Seansı"; }
        else if (currentMode === 'shortBreak') { timeLeft = 5 * 60; timerLabel.textContent = "Kısa Mola"; }
        else if (currentMode === 'longBreak') { timeLeft = 15 * 60; timerLabel.textContent = "Uzun Mola"; }
        updateTimerDisplay();
    });
});

startTimerBtn.addEventListener('click', () => {
    if (isTimerRunning) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        startTimerBtn.innerHTML = '<i class="fa-solid fa-play"></i> Başlat';
        clockAudioPlayer.pause();
    } else {
        trackStat('timerStarts');
        isTimerRunning = true;
        startTimerBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Duraklat';
        if (clockAudioPlayer.src && clockAudioPlayer.src !== window.location.href) {
            clockAudioPlayer.play().catch(e=>console.log(e));
        }
        
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                isTimerRunning = false;
                startTimerBtn.innerHTML = '<i class="fa-solid fa-play"></i> Başlat';
                clockAudioPlayer.pause();
                
                if (currentMode === 'focus') {
                    userData.stats.totalFocus += 25;
                    userData.stats.history[todayStr] += 25;
                    
                    let activeTaskId = activeTaskSelect.value;
                    if (activeTaskId) {
                        let task = userData.tasks.find(t => t.id == activeTaskId);
                        if(task) task.timeSpent += 25;
                    }
                    saveData();
                    
                    // Trigger Post-Session Modal instead of alert
                    reportModal.classList.add('active');
                    
                    if(window.pushToCloud) {
                        window.pushToCloud('sessions', Date.now(), {
                            mode: currentMode,
                            duration: 25,
                            date: todayStr
                        });
                    }
                } else {
                    alert("Mola bitti! Yeni bir odak seansına hazır mısın?");
                }
            }
        }, 1000);
    }
});

resetTimerBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    isTimerRunning = false;
    startTimerBtn.innerHTML = '<i class="fa-solid fa-play"></i> Başlat';
    clockAudioPlayer.pause();
    if (currentMode === 'focus') timeLeft = 25 * 60;
    else if (currentMode === 'shortBreak') timeLeft = 5 * 60;
    else if (currentMode === 'longBreak') timeLeft = 15 * 60;
    updateTimerDisplay();
    document.title = "Bloom - Study softly";
});

// --- TASKS LOGIC ---
document.getElementById('createNewTaskBtn').addEventListener('click', () => {
    const name = document.getElementById('newTaskName').value.trim();
    if(!name) { alert("Lütfen görev adı girin."); return; }
    
    let newTask = {
        id: Date.now(),
        text: name,
        subject: document.getElementById('newTaskSubject').value,
        topic: document.getElementById('newTaskTopic').value,
        targetTime: parseInt(document.getElementById('newTaskTimeGoal').value) || 0,
        timeSpent: 0,
        targetQuestion: parseInt(document.getElementById('newTaskQuestionGoal').value) || 0,
        priority: document.getElementById('newTaskPriority').value,
        ratio: parseInt(document.getElementById('newTaskRatio').value) || 0,
        correct: 0,
        wrong: 0,
        done: false
    };
    userData.tasks.push(newTask);
    if(window.pushToCloud) window.pushToCloud('tasks', newTask.id, newTask);
    
    trackStat('tasksAdded');
    saveData();
    document.getElementById('newTaskName').value = '';
    document.getElementById('newTaskTopic').value = '';
});

window.toggleTask = function(id) {
    let t = userData.tasks.find(x => x.id == id);
    if(t) { 
        t.done = !t.done; 
        if(window.pushToCloud) window.pushToCloud('tasks', t.id, t);
        saveData(); 
    }
}
window.deleteTask = function(id) {
    userData.tasks = userData.tasks.filter(x => x.id != id);
    // Real implementation would delete from Firestore too, but for simplicity we keep local sync priority
    saveData();
}
window.updateTaskStat = function(id, type, val) {
    let t = userData.tasks.find(x => x.id == id);
    if(t) { 
        t[type] = parseInt(val) || 0; 
        if(type === 'correct') {
            userData.stats.totalQuestions = userData.tasks.reduce((sum, task) => sum + (task.correct || 0), 0);
        }
        if(window.pushToCloud) window.pushToCloud('tasks', t.id, t);
        saveData(); 
    }
}

// --- MISTAKES LOGIC ---
document.getElementById('addMistakeBtn').addEventListener('click', () => {
    let topic = document.getElementById('mistakeTopic').value.trim();
    let note = document.getElementById('mistakeNote').value.trim();
    if(!topic || !note) { alert("Konu ve not kısımları boş bırakılamaz."); return; }
    
    let newM = {
        id: Date.now(),
        subject: document.getElementById('mistakeSubject').value,
        topic: topic,
        reason: document.getElementById('mistakeReason').value,
        note: note,
        reviewDate: document.getElementById('mistakeReviewDate').value,
        done: false
    };
    userData.mistakes.push(newM);
    if(window.pushToCloud) window.pushToCloud('mistakes', newM.id, newM);

    saveData();
    document.getElementById('mistakeTopic').value = '';
    document.getElementById('mistakeNote').value = '';
});

window.toggleMistake = function(id) {
    let m = userData.mistakes.find(x => x.id == id);
    if(m) { 
        m.done = !m.done; 
        trackStat('mistakesReviewed'); 
        if(window.pushToCloud) window.pushToCloud('mistakes', m.id, m);
        saveData(); 
    }
}

// --- TOOLS & COACH LOGIC ---
document.getElementById('examDate').addEventListener('change', updateCountdown);
function updateCountdown() {
    let target = new Date(document.getElementById('examDate').value).getTime();
    let now = new Date().getTime();
    let diff = target - now;
    let days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    document.getElementById('countdownResult').innerHTML = `<strong>${days > 0 ? days : 0}</strong> gün kaldı`;
}

document.getElementById('toolCalcNetBtn').addEventListener('click', () => {
    let c = parseInt(document.getElementById('toolCorrect').value) || 0;
    let w = parseInt(document.getElementById('toolWrong').value) || 0;
    let r = parseInt(document.getElementById('toolRatio').value) || 4;
    document.getElementById('toolNetResult').textContent = (c - (w/r)).toFixed(2);
});

// Mini Coach
document.getElementById('coachGenerateBtn').addEventListener('click', () => {
    let h = parseInt(document.getElementById('coachHours').value) || 2;
    let totalMins = h * 60;
    let sessions = Math.floor(totalMins / 30); // 25 work + 5 break = 30
    
    let plan = `✨ ${h} saatlik programınız (${sessions} Pomodoro):\n\n`;
    for(let i=1; i<=sessions; i++) {
        if(i === 1) plan += `${i}. Blok: Konu Tekrarı veya Eksik Giderme (25dk)\n`;
        else if(i === sessions) plan += `${i}. Blok: Yanlış Analizi ve Toparlama (25dk)\n`;
        else plan += `${i}. Blok: Yoğun Soru Çözümü (25dk)\n`;
    }
    plan += `\n* Her blok sonrasında 5 dakika mola vermeyi unutma!`;
    document.getElementById('coachResult').textContent = plan;
});

// Data Export/Reset
document.getElementById('exportDataBtn').addEventListener('click', () => {
    let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData, null, 2));
    let dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "bloom_verilerim.json");
    dlAnchorElem.click();
});

document.getElementById('resetDataBtn').addEventListener('click', () => {
    if(confirm("Tüm verileriniz SİLİNECEK! Emin misiniz?")) {
        localStorage.removeItem('bloom_v2_data');
        window.location.reload();
    }
});


// --- UI UPDATER ---
function updateUI() {
    // 1. Render Tasks
    const fullList = document.getElementById('fullTaskList');
    const todayList = document.getElementById('todaysPlanList');
    const activeSelect = document.getElementById('currentActiveTask');
    
    fullList.innerHTML = '';
    todayList.innerHTML = '';
    
    let currentActiveId = activeSelect.value;
    activeSelect.innerHTML = '<option value="">-- Serbest Çalışma --</option>';
    
    let pendingTasks = 0;
    userData.tasks.forEach(t => {
        if (!t.done) {
            let opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.subject} - ${t.text}`;
            if(t.id == currentActiveId) opt.selected = true;
            activeSelect.appendChild(opt);
            pendingTasks++;
        }

        let n = t.ratio > 0 ? (t.ratio === 1 ? t.correct - t.wrong : t.correct - (t.wrong / t.ratio)) : t.correct;
        let netHtml = t.ratio > 0 ? `<span>Net: <strong>${n > 0 ? n.toFixed(2) : 0}</strong></span>` : `<span>Toplam Çözülen: <strong>${t.correct}</strong></span>`;

        let html = `
            <div class="task-card ${t.done ? 'completed' : ''}" data-priority="${t.priority}">
                <div class="tc-header">
                    <div>
                        <div class="tc-title">${escapeHTML(t.text)}</div>
                        <div class="tc-badges">
                            <span class="tc-badge">${escapeHTML(t.subject)}</span>
                            <span class="tc-badge">${t.timeSpent} / ${t.targetTime || '?'} dk</span>
                        </div>
                    </div>
                    <div class="tc-actions">
                        <button class="btn-check ${t.done ? 'done' : ''}" onclick="toggleTask(${t.id})"><i class="fa-solid fa-check"></i></button>
                        <button class="btn-delete" onclick="deleteTask(${t.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="tc-stats">
                    <input type="number" placeholder="Doğru" value="${t.correct || 0}" onchange="updateTaskStat(${t.id}, 'correct', this.value)">
                    <input type="number" placeholder="Yanlış" value="${t.wrong || 0}" onchange="updateTaskStat(${t.id}, 'wrong', this.value)">
                </div>
                <div class="tc-footer">${netHtml}<span>Hedef: ${t.targetQuestion || '?'} soru</span></div>
            </div>`;
        fullList.innerHTML += html;
        if (!t.done) todayList.innerHTML += html;
    });

    if (pendingTasks === 0) todayList.innerHTML = '<p class="empty-state">Bugün için bekleyen göreviniz yok.</p>';

    // 2. Render Mistakes & Smart Review
    const mList = document.getElementById('mistakesList');
    const sList = document.getElementById('smartReviewList');
    mList.innerHTML = '';
    sList.innerHTML = '';
    
    let smartReviews = 0;

    userData.mistakes.forEach(m => {
        let isDue = m.reviewDate && m.reviewDate <= todayStr && !m.done;
        
        let cardHtml = `
            <div class="task-card ${m.done ? 'completed' : ''}" style="${isDue ? 'border-left-color: var(--danger-color)' : ''}">
                <div class="tc-header">
                    <div>
                        <div class="tc-title">${escapeHTML(m.topic)}</div>
                        <div class="tc-badges">
                            <span class="tc-badge">${escapeHTML(m.subject)}</span>
                            <span class="tc-badge" style="color:var(--danger-color)">${escapeHTML(m.reason)}</span>
                            <span class="tc-badge"><i class="fa-solid fa-clock"></i> ${escapeHTML(m.reviewDate) || 'Tarih Yok'}</span>
                        </div>
                    </div>
                    <div class="tc-actions">
                        <button class="btn-check ${m.done ? 'done' : ''}" onclick="toggleMistake(${m.id})"><i class="fa-solid fa-check"></i></button>
                    </div>
                </div>
                <p style="font-size:0.9rem; margin-top:10px; color:var(--text-muted); background:var(--bg-page); padding:10px; border-radius:8px;">${escapeHTML(m.note)}</p>
            </div>`;
        
        mList.innerHTML += cardHtml;
        if(isDue) { sList.innerHTML += cardHtml; smartReviews++; }
    });

    if(smartReviews === 0) sList.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Şu an beklemede olan acil tekrarınız yok.</p>';

    // 3. Garden
    document.getElementById('gardenTotalCount').textContent = userData.garden.flowers.length;
    document.getElementById('gardenTodayCount').textContent = Math.floor(userData.stats.history[todayStr] / 25) || 0;
    document.getElementById('gardenStreakCount').textContent = userData.stats.streak;
    
    let canvas = document.getElementById('gardenCanvas');
    canvas.innerHTML = '<div class="sun"></div>';
    userData.garden.flowers.forEach(f => {
        let fl = document.createElement('div');
        fl.innerHTML = '<i class="fa-solid fa-fan"></i>';
        fl.style.position = 'absolute';
        fl.style.left = f.x + '%';
        fl.style.bottom = f.y + '%';
        fl.style.color = `hsl(${Math.random() * 360}, 70%, 70%)`;
        fl.style.fontSize = (2 * f.scale) + 'rem';
        canvas.appendChild(fl);
    });

    // 4. Analytics
    document.getElementById('totalFocusMinutes').textContent = userData.stats.history[todayStr] || 0;
    document.getElementById('totalQuestionsSolved').textContent = userData.stats.totalQuestions || 0;

    const heatmap = document.getElementById('heatmapGrid');
    heatmap.innerHTML = '';
    let d = new Date();
    d.setDate(d.getDate() - 6);
    for(let i=0; i<7; i++) {
        let dStr = d.toISOString().split('T')[0];
        let val = userData.stats.history[dStr] || 0;
        let level = val > 240 ? 4 : val > 120 ? 3 : val > 60 ? 2 : val > 0 ? 1 : 0;
        
        let cell = document.createElement('div');
        cell.className = 'heat-cell';
        cell.setAttribute('data-level', level);
        cell.title = `${dStr}: ${val} dk`;
        cell.textContent = d.toLocaleDateString('tr-TR', {weekday:'short'});
        heatmap.appendChild(cell);
        d.setDate(d.getDate() + 1);
    }

    // Update Admin Stats
    const adminList = document.getElementById('adminStatsList');
    if(adminList) {
        adminList.innerHTML = `
            <li><strong>Timer Starts:</strong> ${userData.internalStats.timerStarts}</li>
            <li><strong>Completed Pomodoros:</strong> ${userData.internalStats.completedSessions}</li>
            <li><strong>Tasks Added:</strong> ${userData.internalStats.tasksAdded}</li>
            <li><strong>Mistakes Reviewed:</strong> ${userData.internalStats.mistakesReviewed}</li>
        `;
    }
}

// --- AMBIENT SOUNDS & METRONOME ---
// ... (Metronome and Ambient logic kept exactly the same for length)
const soundCards = document.querySelectorAll('.sound-card[data-sound]');
const audioObjects = {};
let anyAudioPlaying = false;
const globalAudioSection = document.getElementById('globalAudioSection');
const globalPlayPauseBtn = document.getElementById('globalPlayPauseBtn');
const playingSoundsText = document.getElementById('playingSoundsText');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let metronomeInterval = null;
let nextNoteTime = 0.0;
let metronomeVolumeVal = 0;
let isMetronomePlaying = false;

const bpmSlider = document.getElementById('bpmSlider');
const bpmValue = document.getElementById('bpmValue');
const metronomeVolume = document.getElementById('metronomeVolume');

if(bpmSlider) bpmSlider.addEventListener('input', (e) => { bpmValue.textContent = e.target.value; });
if(metronomeVolume) {
    metronomeVolume.addEventListener('input', (e) => {
        metronomeVolumeVal = parseFloat(e.target.value);
        if (metronomeVolumeVal > 0 && !isMetronomePlaying) {
            if(audioCtx.state === 'suspended') audioCtx.resume();
            startMetronome();
        } else if (metronomeVolumeVal === 0 && isMetronomePlaying) {
            stopMetronome();
        }
        updateGlobalAudioUI();
    });
}

function scheduleNote() {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    osc.frequency.value = 800;
    gainNode.gain.setValueAtTime(metronomeVolumeVal, nextNoteTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, nextNoteTime + 0.1);
    osc.start(nextNoteTime);
    osc.stop(nextNoteTime + 0.1);
    const secondsPerBeat = 60.0 / parseInt(bpmSlider.value);
    nextNoteTime += secondsPerBeat;
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) scheduleNote();
    if(isMetronomePlaying) metronomeInterval = setTimeout(scheduler, 25);
}

function startMetronome() {
    if(isMetronomePlaying) return;
    isMetronomePlaying = true;
    nextNoteTime = audioCtx.currentTime + 0.05;
    scheduler();
}

function stopMetronome() {
    isMetronomePlaying = false;
    clearTimeout(metronomeInterval);
}

function updateGlobalAudioUI() {
    let playingNames = [];
    anyAudioPlaying = false;
    for (let key in audioObjects) {
        if (!audioObjects[key].audio.paused && audioObjects[key].audio.volume > 0) { 
            playingNames.push(audioObjects[key].name); anyAudioPlaying = true; 
        }
    }
    if (isMetronomePlaying) { playingNames.push("Metronom"); anyAudioPlaying = true; }
    
    if (playingNames.length > 0) {
        globalAudioSection.style.display = 'flex';
        playingSoundsText.textContent = playingNames.join(', ');
        globalPlayPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        globalAudioSection.style.display = 'none';
        globalPlayPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

globalPlayPauseBtn.addEventListener('click', () => {
    if (anyAudioPlaying) {
        for (let key in audioObjects) if (audioObjects[key].audio.volume > 0) audioObjects[key].audio.pause();
        if (isMetronomePlaying) stopMetronome();
    } else {
        for (let key in audioObjects) if (audioObjects[key].audio.volume > 0) audioObjects[key].audio.play().catch(e=>console.log(e));
        if (metronomeVolumeVal > 0) startMetronome();
    }
    updateGlobalAudioUI();
});

soundCards.forEach(card => {
    const soundFile = card.getAttribute('data-sound');
    if (!soundFile) return;
    const soundName = card.querySelector('h4').textContent;
    const audio = new Audio(soundFile);
    audio.loop = true; audio.volume = 0;
    audioObjects[soundFile] = { audio: audio, name: soundName };
    const slider = card.querySelector('.volume-slider');
    
    slider.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        audio.volume = vol;
        if (vol > 0 && audio.paused) audio.play().catch(e=>console.log(e));
        else if (vol === 0 && !audio.paused) audio.pause();
        updateGlobalAudioUI();
    });
});

// --- FEEDBACK LOGIC (CAPTCHA) ---
let captchaAns = 0;
const captchaQuestion = document.getElementById('captchaQuestion');
const fbCaptcha = document.getElementById('fbCaptcha');
const feedbackForm = document.getElementById('feedbackForm');

function generateCaptcha() {
    let num1 = Math.floor(Math.random() * 10) + 1;
    let num2 = Math.floor(Math.random() * 10) + 1;
    captchaAns = num1 + num2;
    if(captchaQuestion) captchaQuestion.textContent = `${num1} + ${num2} = ?`;
    if(fbCaptcha) fbCaptcha.value = '';
}

if(document.querySelector('[data-tab="tab-feedback"]')) {
    document.querySelector('[data-tab="tab-feedback"]').addEventListener('click', generateCaptcha);
}

if(feedbackForm) {
    feedbackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if(parseInt(fbCaptcha.value) !== captchaAns) {
            alert("Matematik doğrulaması yanlış. Lütfen tekrar deneyin.");
            generateCaptcha();
            return;
        }
        let subject = encodeURIComponent(document.getElementById('fbSubject').value);
        let msg = encodeURIComponent(document.getElementById('fbMessage').value + "\n\nGönderen: " + document.getElementById('fbEmail').value);
        window.location.href = `mailto:admin@bloom.com?subject=Geri Bildirim: ${subject}&body=${msg}`;
        alert("Geri bildiriminiz mail uygulamanıza yönlendirildi. Teşekkür ederiz!");
        feedbackForm.reset();
        generateCaptcha();
    });
}

// --- SLIDER PROGRESS FILL ---
function updateSliderFill(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const val = parseFloat(slider.value) || 0;
    const percentage = ((val - min) / (max - min)) * 100;
    const isDark = document.body.classList.contains('dark-mode');
    const trackColor = slider.closest('.clock-sound-controls') 
        ? (isDark ? '#444' : '#dcd7d7') 
        : (isDark ? '#333' : '#EBE5E5');
    slider.style.background = `linear-gradient(to right, var(--primary-color) ${percentage}%, ${trackColor} ${percentage}%)`;
}
document.addEventListener('input', (e) => { if (e.target.matches('input[type="range"]')) updateSliderFill(e.target); });

// --- INIT ---
document.querySelectorAll('input[type="range"]').forEach(updateSliderFill);
updateCountdown();
updateUI();
generateCaptcha();

// --- COOKIE CONSENT & PRIVACY MODALS ---
const cb = document.getElementById('cookieConsentBanner');
if(!localStorage.getItem('bloom_cookie_consent')) {
    cb.style.display = 'block';
}

document.getElementById('acceptAllCookies')?.addEventListener('click', () => {
    localStorage.setItem('bloom_cookie_consent', 'all');
    cb.style.display = 'none';
});

document.getElementById('rejectCookies')?.addEventListener('click', () => {
    localStorage.setItem('bloom_cookie_consent', 'essential');
    cb.style.display = 'none';
});

window.openPrivacyModal = function(type) {
    const modal = document.getElementById('privacy-modal');
    const title = document.getElementById('privacyModalTitle');
    const content = document.getElementById('privacyModalContent');
    
    if(type === 'kvkk') {
        title.textContent = "Gizlilik Politikası";
        content.innerHTML = `
            <p><strong>Özet:</strong> Uygulamamız verilerinizi cihazınızda (offline) depolar. Hesap oluşturmanız halinde veriler güvenli bulut altyapısında şifrelenerek yedeklenir. Üçüncü şahıslara veri satılmaz.</p>
            <p>Sizden sadece bir e-posta adresi ve çalışma istatistikleriniz (görev isimleri, çözülen soru sayıları) alınmaktadır. LGS / lise öğrencisi iseniz hesabınızı ailenizin gözetiminde oluşturmanızı öneririz.</p>
        `;
    } else if(type === 'cookie') {
        title.textContent = "Çerez (Cookie) Politikası";
        content.innerHTML = `
            <p><strong>Zorunlu Çerezler:</strong> Giriş durumunuzu ve çevrimdışı verilerinizi kaydetmek için LocalStorage kullanıyoruz. Bunlar sistemin çalışması için zorunludur.</p>
            <p><strong>Analitik Çerezler:</strong> Onay vermeniz durumunda uygulama içi deneyimi ölçümlemek için kullanılır. İstediğiniz zaman tarayıcınızın ayarlarından site verilerini ve çerezleri temizleyerek bu onayları silebilirsiniz.</p>
        `;
    } else if(type === 'terms') {
        title.textContent = "Kullanım Şartları";
        content.innerHTML = `
            <p>Bu uygulama bir çalışma asistanıdır. Bulut senkronizasyonu ücretsiz olarak "olduğu gibi" sunulmaktadır ve herhangi bir veri kaybından Bloom sorumlu tutulamaz. Lütfen düzenli olarak Araçlar sekmesinden "JSON İndir" diyerek yedeğinizi alın.</p>
        `;
    }
    
    modal.classList.add('active');
}
