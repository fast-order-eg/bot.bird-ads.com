import sequelize from './config/database.js';
import Instruction from './models/Instruction.js';

async function viewInstruction() {
    try {
        await sequelize.authenticate();
        const inst = await Instruction.findByPk(9);
        if (inst) {
            console.log(inst.content);
        } else {
            console.log("Instruction 9 not found.");
        }
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

viewInstruction();
