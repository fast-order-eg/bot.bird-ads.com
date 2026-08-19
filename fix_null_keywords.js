import Instruction from './models/Instruction.js';
import { generateKeywords } from './controllers/aiController.js';

async function fixNullKeywords() {
    console.log("⏳ Starting Keyword Backfill...");

    // Find all instructions with null keywords
    const instructions = await Instruction.findAll();
    console.log(`🔍 Found ${instructions.length} instructions total.`);

    let count = 0;
    for (const inst of instructions) {
        if (!inst.keywords) {
            console.log(`📝 Generating keywords for: "${inst.title}"...`);
            const keywords = await generateKeywords(inst.content);
            if (keywords) {
                inst.keywords = keywords;
                // Default existing instructions to 'topic' type, or 'global' if it looks like one?
                // For safety, let's keep them as 'topic' unless the user changes them manually.
                // Or maybe check if title implies global?
                // Let's stick to default 'topic'.
                inst.type = 'topic';
                await inst.save();
                console.log(`   ✅ Updated: ${keywords}`);
                count++;
            } else {
                console.log(`   ❌ Failed to generate keywords.`);
            }
        }
    }

    console.log(`🎉 Backfill Complete. Updated ${count} instructions.`);
    process.exit();
}

fixNullKeywords();
