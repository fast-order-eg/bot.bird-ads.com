import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MessengerPage = sequelize.define('MessengerPage', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    pageName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    pageId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    accessToken: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    instagramId: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    instagramUsername: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    defaultComment: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'أهلاً وسهلاً بحضرتك \nتم إرسال التفاصيل لك في الرسائل الخاصة ✅'
    },
    // وضع الرد: 'ai' = ذكاء اصطناعي, 'fixed' = رد ثابت
    replyMode: {
        type: DataTypes.ENUM('ai', 'fixed'),
        defaultValue: 'ai',
        allowNull: false
    },
    fixedReply: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    },
    fixedReplyImages: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null
    },
    useButtonsWithFixedReply: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    replyToMessagesWithFixed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    replyToIgMessagesWithFixed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    // الـ verify token بتاعنا اللي بنحطه في ميتا
    webhookVerifyToken: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'lina_messenger_verify_2024'
    }
}, {
    tableName: 'messenger_pages'
});

export default MessengerPage;
