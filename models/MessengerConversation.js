import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MessengerConversation = sequelize.define('MessengerConversation', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    pageId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    senderId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    senderName: {
        type: DataTypes.STRING,
        defaultValue: 'عميل'
    },
    summary_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_handoff: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    // تاريخ آخر رسالة
    lastMessageAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    // ملخص المحادثة اللي بيعمله الـ AI
    summary: {
        type: DataTypes.TEXT,
        defaultValue: null
    },
    // عدد الرسائل
    messageCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'messenger_conversations'
});

export default MessengerConversation;
