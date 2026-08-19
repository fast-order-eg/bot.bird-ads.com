import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const TeachMessage = sequelize.define('TeachMessage', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    role: {
        type: DataTypes.ENUM('user', 'model'), // user (Admin teaching) | model (AI Reply)
        allowNull: false
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    }
});

User.hasMany(TeachMessage);
TeachMessage.belongsTo(User);

export default TeachMessage;
