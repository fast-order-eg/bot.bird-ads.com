import sequelize from './config/database.js';
import User from './models/User.js';
import Instruction from './models/Instruction.js';
import SimulationMessage from './models/SimulationMessage.js';

async function run() {
    try {
        const users = await User.findAll();
        console.log("=== ALL USERS ===");
        users.forEach(u => {
            console.log(`ID: ${u.id}, Username: ${u.username}, Role: ${u.role}`);
        });

        // Find the 'bot' user specifically
        const botUser = users.find(u => u.username && u.username.toLowerCase().includes('bot'));
        if (!botUser) {
            console.log("\n❌ No user with username containing 'bot' found.");
            return;
        }

        console.log(`\n=== SELECTED BOT USER (ID: ${botUser.id}, Username: ${botUser.username}) ===`);
        
        // Find instructions for this user
        const instructions = await Instruction.findAll({
            where: { UserId: botUser.id }
        });
        
        console.log(`\n=== INSTRUCTIONS FOR USER ${botUser.username} (Count: ${instructions.length}) ===`);
        instructions.forEach((inst, index) => {
            console.log(`\n--- Instruction #${index + 1} ---`);
            console.log(`ID: ${inst.id}`);
            console.log(`ClientName: ${inst.clientName}`);
            console.log(`Title: ${inst.title}`);
            console.log(`Type: ${inst.type}`);
            console.log(`IsActive: ${inst.isActive}`);
            console.log(`Keywords: ${inst.keywords}`);
            console.log(`ImageUrl: ${inst.imageUrl}`);
            console.log(`Content:\n${inst.content}`);
        });

        // Let's check last 10 simulation messages
        const simMsgs = await SimulationMessage.findAll({
            where: { UserId: botUser.id },
            order: [['createdAt', 'DESC']],
            limit: 10
        });
        console.log(`\n=== RECENT SIMULATION MESSAGES ===`);
        simMsgs.reverse().forEach(m => {
            console.log(`[${m.role}] ${m.content}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        sequelize.close();
    }
}
run();
