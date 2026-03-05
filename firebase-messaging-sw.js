// firebase-messaging-sw.js - Service Worker for Firebase Cloud Messaging
// This file handles push notifications in the background

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize Firebase in service worker
firebase.initializeApp({
  apiKey: "AIzaSyCP-Gha19gZ6ZkYCzZ9vh9QL2tKYmNVoCk",
  authDomain: "quartrix-eb95f.firebaseapp.com",
  databaseURL: "https://quartrix-eb95f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quartrix-eb95f",
  storageBucket: "quartrix-eb95f.firebasestorage.app",
  messagingSenderId: "589369640106",
  appId: "1:589369640106:web:7239da0bd98bae284fbcd3"
});

const messaging = firebase.messaging();

// Handle background push notifications
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification.title || 'Tugas Baru!';
  const notificationOptions = {
    body: payload.notification.body || 'Admin telah menambahkan tugas baru',
    icon: 'https://i.ibb.co.com/7xxVWwH7/IMG-8428.png',
    badge: 'https://i.ibb.co.com/7xxVWwH7/IMG-8428.png',
    tag: 'tugas-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Buka Dashboard'
      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // If dashboard is open, focus it
        for (const client of clientList) {
          if (client.url.includes('dashboard.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open dashboard
        if (clients.openWindow) {
          return clients.openWindow('dashboard.html');
        }
      })
  );
});

