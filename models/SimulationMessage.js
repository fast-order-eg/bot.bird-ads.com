import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const SimulationMessage = sequelize.define('SimulationMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    role: {
        type: DataTypes.ENUM('user', 'model'), // user (Admin testing) | model (AI Reply)
        allowNull: false
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    }
});

// Relationships
User.hasMany(SimulationMessage);
SimulationMessage.belongsTo(User);

export default SimulationMessage;
