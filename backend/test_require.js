try {
    const { processPendingNotifications } = require('./lib/dispatchEmail');
    console.log('Successfully required ./lib/dispatchEmail');
    console.log('Function type:', typeof processPendingNotifications);
} catch (err) {
    console.error('Failed to require ./lib/dispatchEmail:', err.message);
}

try {
    const tellerRoutes = require('./routes/tellerRoutes');
    console.log('Successfully required ./routes/tellerRoutes');
} catch (err) {
    console.error('Failed to require ./routes/tellerRoutes:', err.message);
}
