import { database } from './firebase-config.js';
import { ref, get, set, push } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

export class FirebaseService {
    constructor() {
        this.db = database;
    }

    /**
     * Sanitize hostname to be safe for Firebase keys (replace . with _)
     */
    _sanitize(hostname) {
        return hostname.replace(/\./g, '_');
    }

    /**
     * Fetch a rule for a specific hostname
     * @param {string} hostname 
     * @returns {Promise<object|null>} The rule object or null if not found
     */
    async getRule(hostname) {
        const key = this._sanitize(hostname);
        try {
            const ruleRef = ref(this.db, `rules/${key}`);
            const snapshot = await get(ruleRef);

            if (snapshot.exists()) {
                return snapshot.val();
            } else {
                return null;
            }
        } catch (error) {
            console.error("FirebaseService: Failed to get rule", error);
            return null;
        }
    }

    /**
     * Request a rule analysis for a hostname
     * @param {string} hostname 
     * @param {string} html The HTML content to analyze
     */
    async requestRule(hostname, html) {
        const key = this._sanitize(hostname);
        const requestData = {
            html: html,
            status: "pending",
            timestamp: Date.now()
        };

        try {
            const requestRef = ref(this.db, `requests/${key}`);
            await set(requestRef, requestData);
            console.log(`Firebase: Requested analysis for ${hostname}`);
        } catch (error) {
            console.error("FirebaseService: Failed to request rule", error);
        }
    }

    /**
     * Report a bad rule (increment failure count)
     * @param {string} hostname 
     */
    async reportRule(hostname) {
        const key = this._sanitize(hostname);
        try {
            const reportData = {
                timestamp: Date.now(),
                hostname: hostname
            };

            const reportsRef = ref(this.db, `reports/${key}`);
            await push(reportsRef, reportData);
            console.log(`FirebaseService: Reported rule for ${hostname}`);
        } catch (error) {
            console.error("FirebaseService: Failed to report rule", error);
        }
    }

    /**
     * Poll for a rule update
     * @param {string} hostname 
     * @param {function} callback Function to call when rule is found
     * @param {number} intervalMs Polling interval in ms
     * @returns {function} Stop polling function
     */
    listenForRule(hostname, callback, intervalMs = 2000) {
        let active = true;
        const poll = async () => {
            if (!active) return;
            const rule = await this.getRule(hostname);
            if (rule) {
                callback(rule);
            }
            if (active) setTimeout(poll, intervalMs);
        };
        poll();
        return () => { active = false; };
    }
}
