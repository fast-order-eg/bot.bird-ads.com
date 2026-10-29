import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const MessengerPageAccount = sequelize.define('MessengerPageAccount', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    pageId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    pageName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    UserId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    fbUserId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fbUserName: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'حساب فيسبوك'
    },
    fbUserPicture: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    accessToken: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    // حالة الحساب: active = شغال, checkpoint = مقفول سيلفي/تحقق, error = منتهي/خطأ, paused = موقوف يدوياً
    status: {
        type: DataTypes.ENUM('active', 'checkpoint', 'error', 'paused'),
        defaultValue: 'active',
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    isSystemUser: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    lastError: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'messenger_page_accounts'
});

export default MessengerPageAccount;
