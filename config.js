import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ override: true });

// Safeguard against stale environment variables pointing to missing files
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
   const fallback = 'project-c1442437-41e2-480c-86d-0935778ac612.json';
   if (fs.existsSync(fallback)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = fallback;
   } else {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
   }
}

export const CONFIG = {
   USER_KEY: process.env.VERTEX_USER_KEY || "missing_key",
   PROJECT_ID: process.env.VERTEX_PROJECT_ID || "project-c1442437-41e2-480c-86d",
   MODEL_NAME: "gemini-2.5-flash",
   FALLBACK_MODEL_NAME: "gemini-2.5-flash-lite",
   GOOGLE_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'project-c1442437-41e2-480c-86d-0935778ac612.json',

   SYSTEM_INSTRUCTIONS: `أنت مساعد ذكي ومهني. هدفك مساعدة العملاء والإجابة على استفساراتهم باحترافية ودقة.`
};

