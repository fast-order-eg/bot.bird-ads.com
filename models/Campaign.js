import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Campaign = sequelize.define('Campaign', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    platform: {
        type: DataTypes.ENUM('whatsapp', 'messenger'),
        defaultValue: 'whatsapp'
    },
    status: {
        type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending'
    },
    targetCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    sentCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    failedCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
});

import User from './User.js';
Campaign.belongsTo(User);
User.hasMany(Campaign);

export default Campaign;
