import Instruction from './models/Instruction.js';

async function checkKeywords() {
    try {
        const insts = await Instruction.findAll();
        const missing = insts.filter(i => !i.keywords);

        console.log(`Total instructions: ${insts.length}`);
        console.log(`Missing keywords: ${missing.length}`);

        if (missing.length > 0) {
            console.log('\nInstructions needing keywords:');
            missing.forEach(i => console.log(`  - [${i.id}] ${i.title}`));
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit();
    }
}

checkKeywords();
