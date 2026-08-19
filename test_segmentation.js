import { analyzeAndSegmentText } from './controllers/aiController.js';

const sampleText = `
أهلاً بيك في المنصة التعليمية. أنا مساعدك الذكي.
الأسعار عندنا كالتالي:
- باقة الشهر: 100 جنيه
- باقة السنة: 1000 جنيه

طرق الدفع المتاحة:
- فودافون كاش
- فيزا
- فوري

للتواصل معنا:
اتصل على 0100000000
`;

async function test() {
    console.log("🚀 Testing Smart Segmentation...");
    const segments = await analyzeAndSegmentText(sampleText);
    console.log("✅ Result:", JSON.stringify(segments, null, 2));
}

test();
