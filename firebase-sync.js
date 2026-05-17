// firebase-sync.js
// Firebase Initialization & Sync Service for Bloom

const firebaseConfig = {
    apiKey: "AIzaSyADXstlt_YbCLo_5IaU2jRmMSiz_ObEPcg",
    authDomain: "bloom-28c81.firebaseapp.com",
    projectId: "bloom-28c81",
    storageBucket: "bloom-28c81.firebasestorage.app",
    messagingSenderId: "459853872926",
    appId: "1:459853872926:web:263f892fb778103e1d930f"
};

// Only init if user configured it
if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    window.db = firebase.firestore();
    window.auth = firebase.auth();
} else {
    window.db = null;
    window.auth = null;
}

window.syncState = {
    isOnline: navigator.onLine,
    uid: null,
    isGuest: true
};

// Listen to network status
window.addEventListener('online', () => { window.syncState.isOnline = true; updateHeaderStatus(); });
window.addEventListener('offline', () => { window.syncState.isOnline = false; updateHeaderStatus(); });

// Auth Listener
if(window.auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            window.syncState.uid = user.uid;
            window.syncState.isGuest = user.isAnonymous;
            updateHeaderStatus();
            if(!user.isAnonymous) {
                // Fetch cloud data and merge
                fetchCloudDataAndMerge();
            }
        } else {
            window.syncState.uid = null;
            window.syncState.isGuest = true;
            updateHeaderStatus();
        }
    });
}

function updateHeaderStatus() {
    const emailDisplay = document.getElementById('userEmailDisplay');
    const authBtn = document.getElementById('openAuthBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if(!emailDisplay) return;

    if(!window.syncState.isOnline) {
        emailDisplay.innerHTML = '<i class="fa-solid fa-wifi" style="color:var(--danger-color)"></i> Çevrimdışı';
        emailDisplay.style.display = 'inline-block';
        return;
    }

    if(window.syncState.uid) {
        authBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        emailDisplay.style.display = 'inline-block';
        if(window.syncState.isGuest) {
            emailDisplay.innerHTML = '<i class="fa-solid fa-user-secret"></i> Misafir';
        } else {
            emailDisplay.innerHTML = '<i class="fa-solid fa-cloud"></i> Bulut Aktif';
        }
    } else {
        authBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        emailDisplay.style.display = 'none';
    }
}

// --- SYNC LOGIC (LAZY SYNC) ---
// We only push to cloud when an event happens, avoiding high costs.

window.pushToCloud = function(collectionName, docId, data) {
    // Only push if user is logged in (not guest) and online
    if (!window.db || !window.syncState.uid || window.syncState.isGuest || !window.syncState.isOnline) return;
    
    const payload = {
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('users').doc(window.syncState.uid).collection(collectionName).doc(docId.toString())
      .set(payload, { merge: true })
      .catch(err => console.error("Cloud Sync Error:", err));
};

window.pushProfileToCloud = function(userDataObj) {
    if (!window.db || !window.syncState.uid || window.syncState.isGuest || !window.syncState.isOnline) return;
    
    // Only sync stats, internalStats, and settings (keep array heavy lifting separated)
    const payload = {
        stats: userDataObj.stats,
        internalStats: userDataObj.internalStats,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    db.collection('users').doc(window.syncState.uid).set(payload, { merge: true });
};

async function fetchCloudDataAndMerge() {
    if (!window.db || !window.syncState.uid || window.syncState.isGuest) return;
    
    try {
        // Fetch tasks
        const tasksSnap = await db.collection('users').doc(window.syncState.uid).collection('tasks').get();
        let cloudTasks = [];
        tasksSnap.forEach(doc => cloudTasks.push(doc.data()));
        
        // Very basic merge: Local takes precedence if ID matches for simplicity in this offline-first model
        // In a strict prod app, we'd compare updatedAt timestamps.
        cloudTasks.forEach(ct => {
            if(!userData.tasks.find(t => t.id === ct.id)) {
                userData.tasks.push(ct);
            }
        });

        // Same for mistakes
        const mistakesSnap = await db.collection('users').doc(window.syncState.uid).collection('mistakes').get();
        mistakesSnap.forEach(doc => {
            let m = doc.data();
            if(!userData.mistakes.find(x => x.id === m.id)) userData.mistakes.push(m);
        });
        
        saveData(); // Will trigger updateUI
    } catch(err) {
        console.error("Merge error:", err);
    }
}

// Ensure auth functions trigger properly
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(window.auth) window.auth.signOut();
        });
    }
});
