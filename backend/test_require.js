try {
    require('firebase-admin');
    console.log('firebase-admin loaded successfully');
} catch (e) {
    console.error('Failed to load firebase-admin:', e.message);
}
