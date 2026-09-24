import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ override: true });

// Safeguard against stale environment variables pointing to missing files
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
   const fallback = 'fast-order-505012-2adde4c0badf.json';
   if (fs.existsSync(fallback)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = fallback;
   } else {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
   }
}

export const CONFIG = {
   USER_KEY: process.env.VERTEX_USER_KEY || "missing_key",
   PROJECT_ID: process.env.VERTEX_PROJECT_ID || "fast-order-505012",
   MODEL_NAME: process.env.VERTEX_MODEL_NAME || "gemini-3.8-flash",
   FALLBACK_MODEL_NAME: process.env.VERTEX_FALLBACK_MODEL || "gemini-2.5-flash",
   LOCATION: process.env.VERTEX_LOCATION || "global",
   GOOGLE_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'fast-order-505012-2adde4c0badf.json',

   getVertexUrl(modelName = null, location = null) {
       const m = modelName || this.MODEL_NAME;
       const loc = location || this.LOCATION;
       if (loc === 'global') {
           return `https://aiplatform.googleapis.com/v1/projects/${this.PROJECT_ID}/locations/global/publishers/google/models/${m}:generateContent`;
       }
       return `https://${loc}-aiplatform.googleapis.com/v1/projects/${this.PROJECT_ID}/locations/${loc}/publishers/google/models/${m}:generateContent`;
   },

   SYSTEM_INSTRUCTIONS: `أنت مساعد ذكي ومهني. هدفك مساعدة العملاء والإجابة على استفساراتهم باحترافية ودقة.`
};

export function getVertexEndpoint(modelName, location) {
    return CONFIG.getVertexUrl(modelName, location);
}
