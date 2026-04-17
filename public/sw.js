self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'עלינא', body: event.data?.text() || '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'עלינא', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      dir: 'rtl',
      lang: 'he',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/QueueJoin'));
});
