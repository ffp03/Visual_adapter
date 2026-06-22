// Firebase Web SDK v9+ Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCv8tE4Ds64eCG3n9K9HhIfamrpGCSNCa4",
    authDomain: "visual-adapter.firebaseapp.com",
    databaseURL: "https://visual-adapter-default-rtdb.firebaseio.com",
    projectId: "visual-adapter",
    storageBucket: "visual-adapter.firebasestorage.app",
    messagingSenderId: "697903303282",
    appId: "1:697903303282:web:2a19892ee8d640afb090eb",
    measurementId: "G-YR4SG4EJLY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { app, database };
