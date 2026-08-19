import sequelize from './config/database.js';
import Instruction from './models/Instruction.js';

async function debugInstructions() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        // Assuming User 2 based on the screenshot (ID: 2)
        const userId = 2;

        const instructions = await Instruction.findAll({
            where: { UserId: userId },
            attributes: ['id', 'clientName', 'type', 'keywords', 'content'] // content length only
        });

        console.log(`\n🔍 Found ${instructions.length} instructions for User ${userId}:`);

        let globalCount = 0;
        let topicCount = 0;
        let totalContentLength = 0;

        instructions.forEach(inst => {
            const contentLength = inst.content.length;
            totalContentLength += contentLength;

            console.log(`\n📌 ID: ${inst.id} | Name: ${inst.clientName} | Type: [${inst.type.toUpperCase()}]`);
            console.log(`   🔑 Keywords: ${inst.keywords}`);
            console.log(`   📏 Length: ${contentLength} chars`);

            if (inst.type === 'global') globalCount++;
            else topicCount++;
        });

        console.log('\n📊 SUMMARY:');
        console.log(`   - Global (Always Loaded): ${globalCount}`);
        console.log(`   - Topic (Conditional): ${topicCount}`);
        console.log(`   - Total Content Length: ${totalContentLength} chars`);

    } catch (error) {
        console.error('Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

debugInstructions();
