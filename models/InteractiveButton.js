import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import InteractiveMenu from './InteractiveMenu.js';
import Product from './Product.js';

const InteractiveButton = sequelize.define('InteractiveButton', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    label: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'النص اللي بيظهر على الزرار (مثال: خدمة العملاء)'
    },
    buttonId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'معرف فريد للزرار (مثال: btn_customer_service)'
    },
    responseText: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'الرد اللي بيطلع لما العميل يدوس على الزرار'
    },
    responseImage: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'مسار صورة مرفقة مع الرد (اختياري)'
    },
    MenuId: {
        type: DataTypes.INTEGER,
        allowNull: true, // Allow null temporarily during migration
        comment: 'معرف القائمة التي ينتمي لها الزر'
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'ترتيب الظهور في القائمة'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'حالة التفعيل (شغال/موقف)'
    },
    continueToAI: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'بعد الرد يكمل AI ولا يعرض الأزرار تاني؟'
    },
    NextMenuId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'إذا تم اختياره، سيقوم بفتح هذه القائمة بعد الرد'
    },
    platform: {
        type: DataTypes.STRING,
        defaultValue: 'both',
        comment: 'المنصة: both, whatsapp, messenger'
    },
    ProductId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'معرف المنتج المرتبط (لعرض بياناته كرسالة)'
    }
}, {
    tableName: 'interactive_buttons'
});

// Relationships
User.hasMany(InteractiveButton, { onDelete: 'CASCADE' });
InteractiveButton.belongsTo(User);

InteractiveMenu.hasMany(InteractiveButton, { foreignKey: 'MenuId', onDelete: 'CASCADE' });
InteractiveButton.belongsTo(InteractiveMenu, { foreignKey: 'MenuId' });

Product.hasMany(InteractiveButton, { foreignKey: 'ProductId', onDelete: 'SET NULL' });
InteractiveButton.belongsTo(Product, { foreignKey: 'ProductId' });

export default InteractiveButton;
