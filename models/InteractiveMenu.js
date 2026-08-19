import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const InteractiveMenu = sequelize.define('InteractiveMenu', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    menuName: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'اسم القائمة للتعرف عليها في لوحة التحكم (مثال: قائمة الأسعار)'
    },
    triggerWords: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'كلمات التشغيل مفصولة بفاصلة (مثال: اسعار,بكام,price)'
    },
    welcomeMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: 'أهلاً بيك! 👋 اختار من القائمة:',
        comment: 'رسالة الترحيب التي تظهر فوق الأزرار'
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'هل هذه هي القائمة الرئيسية (تظهر للعميل الجديد وفي الرد الثابت)؟'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'حالة التفعيل (شغال/موقف)'
    }
}, {
    tableName: 'interactive_menus'
});

// Relationships
User.hasMany(InteractiveMenu, { onDelete: 'CASCADE' });
InteractiveMenu.belongsTo(User);

export default InteractiveMenu;
