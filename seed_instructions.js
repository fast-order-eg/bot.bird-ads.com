import sequelize from './config/database.js';
import User from './models/User.js';
import Instruction from './models/Instruction.js';
import { CONFIG } from './config.js';

async function seedInstructions() {
    try {
        await sequelize.sync();

        // Find user with username "1"
        const user = await User.findOne({ where: { username: '1' } });

        if (!user) {
            console.log('❌ User "1" not found. Please create this user first.');
            process.exit(1);
        }

        // Delete existing instructions for this user
        await Instruction.destroy({ where: { UserId: user.id } });

        // Insert default instructions from config.js
        await Instruction.create({
            UserId: user.id,
            clientName: 'بيرد ادز',
            title: 'التعليمات الشاملة - نظام لينا',
            content: CONFIG.SYSTEM_INSTRUCTIONS,
            order: 1
        });

        console.log('✅ Instructions seeded successfully for user "1"');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding instructions:', error);
        process.exit(1);
    }
}

seedInstructions();
