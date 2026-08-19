import sequelize from './config/database.js';
import { DataTypes } from 'sequelize';

const addColumns = async () => {
    try {
        const queryInterface = sequelize.getQueryInterface();

        // Add pause_until column
        await queryInterface.addColumn('users', 'pause_until', {
            type: DataTypes.DATE,
            allowNull: true
        });
        console.log('✅ Added pause_until column');

        // Add control_group_jid column
        await queryInterface.addColumn('users', 'control_group_jid', {
            type: DataTypes.STRING,
            allowNull: true
        });
        console.log('✅ Added control_group_jid column');

        console.log('🎉 Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during migration:', error);
        process.exit(1);
    }
};

addColumns();
