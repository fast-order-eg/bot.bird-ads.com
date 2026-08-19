import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Instruction = sequelize.define('Instruction', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    clientName: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'اسم العميل أو التصنيف'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'عنوان التعليمات'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'محتوى التعليمات الكامل'
    },
    actionTarget: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'اسم الجروب أو الشخص اللي هيتبعتله الطلبات (WhatsApp)'
    },
    imageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'مسار الصورة المرفقة مع التعليمات'
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'ترتيب العرض'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'حالة التفعيل (شغال/موقف)'
    },
    // [NEW] AI Optimization Fields
    keywords: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'كلمات مفتاحية لاستدعاء التعليمات (AI Generated)'
    },
    type: {
        type: DataTypes.STRING,
        defaultValue: 'topic', // 'global' or 'topic'
        comment: 'نوع التعليمات: عامة (دائماً تظهر) أو موضوع (عند الطلب)'
    }
}, {
    tableName: 'instructions'
});

// Relationships
User.hasMany(Instruction, { onDelete: 'CASCADE' });
Instruction.belongsTo(User);

export default Instruction;
