import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Message = sequelize.define('Message', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    remoteJid: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('user', 'model'),
        allowNull: false
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    media_url: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'messages'
});

// Relationships
User.hasMany(Message, { onDelete: 'CASCADE' });
Message.belongsTo(User);

export default Message;
