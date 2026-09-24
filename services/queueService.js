import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import { CONFIG } from '../config.js';


class VertexQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        // 2000ms delay ensures max ~30 requests per minute.
        // Google free tier is typically 15 RPM for some models, or 50 RPM. 
        // 2000ms is a safe baseline. If we hit 429, we auto-retry.
        this.delayMs = 2000; 
    }

    /**
     * Add an API call to the queue.
     * @param {Function} apiCallFunction - A function that returns a Promise resolving to the API response.
     * @returns {Promise} Resolves with the API response or rejects after max retries.
     */
    async add(apiCallFunction) {
        return new Promise((resolve, reject) => {
            this.queue.push({ apiCallFunction, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.isProcessing) return;
        if (this.queue.length === 0) return;

        this.isProcessing = true;
        
        const { apiCallFunction, resolve, reject } = this.queue.shift();

        let success = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!success && attempts < maxAttempts) {
            attempts++;
            try {
                // Execute the API call
                const result = await apiCallFunction();
                resolve(result);
                success = true;
            } catch (error) {
                // Check if it's a 429 Error
                if (error.message && error.message.includes('429')) {
                    console.warn(`[VertexQueue] ⚠️ 429 Resource Exhausted. Retrying attempt ${attempts}/${maxAttempts} after 5 seconds...`);
                    await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds before retry
                    if (attempts >= maxAttempts) {
                        console.error(`[VertexQueue] ❌ Max retries reached for 429 error.`);
                        reject(error);
                    }
                } else {
                    // Other error (e.g., 500, parsing error), fail immediately
                    console.error(`[VertexQueue] ❌ Vertex API Error:`, error.message);
                    reject(error);
                    break;
                }
            }
        }

        // Enforce delay before processing the next request in the queue
        await new Promise(r => setTimeout(r, this.delayMs));
        
        this.isProcessing = false;
        
        // Process next item recursively
        this.process();
    }
}

export const vertexQueue = new VertexQueue();

/**
 * Executes a request to Google Cloud Vertex AI using the queue and automatic model fallback.
 * It attempts the primary model (CONFIG.MODEL_NAME or gemini-2.5-flash) first.
 * If that fails or encounters congestion/delay, it automatically switches to the fallback model (CONFIG.FALLBACK_MODEL_NAME or gemini-2.5-flash-lite).
 */
export async function executeVertexAI(payload, location = null) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        const fallback = 'fast-order-505012-2adde4c0badf.json';
        if (fs.existsSync(fallback)) {
            process.env.GOOGLE_APPLICATION_CREDENTIALS = fallback;
        } else {
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
    }

    const auth = new GoogleAuth({
        keyFilename: CONFIG.GOOGLE_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || 'fast-order-505012-2adde4c0badf.json',
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const tokenStr = typeof accessToken === 'string' ? accessToken : (accessToken?.token || '');

    const primaryModel = CONFIG.MODEL_NAME || 'gemini-3.8-flash';
    const fallbackModel = CONFIG.FALLBACK_MODEL_NAME || 'gemini-2.5-flash';
    const projectId = CONFIG.PROJECT_ID || 'fast-order-505012';
    const loc = location || CONFIG.LOCATION || 'global';

    const getEndpointUrl = (model, l) => {
        if (CONFIG.getVertexUrl) return CONFIG.getVertexUrl(model, l);
        if (l === 'global') {
            return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:generateContent`;
        }
        return `https://${l}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${l}/publishers/google/models/${model}:generateContent`;
    };

    const primaryUrl = getEndpointUrl(primaryModel, loc);
    const fallbackUrl = getEndpointUrl(fallbackModel, loc);

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenStr}`
    };

    return await vertexQueue.add(async () => {
        // Helper to perform fetch with timeout
        const fetchWithTimeout = async (url, options, timeoutMs = 25000) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timer);
                return res;
            } catch (err) {
                clearTimeout(timer);
                throw err;
            }
        };

        try {
            const res = await fetchWithTimeout(primaryUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            }, 12000);

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Status ${res.status}: ${errText}`);
            }
            return res;
        } catch (error) {
            console.warn(`[Vertex AI Fallback] ⚠️ Primary model (${primaryModel}) encountered issue or delay: ${error.message || error}. Switching automatically to fallback model (${fallbackModel})...`);
            
            const resFallback = await fetch(fallbackUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!resFallback.ok) {
                const errText = await resFallback.text();
                throw new Error(`Vertex AI Fallback Error ${resFallback.status}: ${errText}`);
            }
            return resFallback;
        }
    });
}
