import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'اسم المنتج أو الخدمة'
    },
    type: {
        type: DataTypes.ENUM('product', 'service'),
        allowNull: false,
        defaultValue: 'product',
        comment: 'نوع العنصر: منتج أو خدمة'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'وصف تفصيلي للمنتج أو الخدمة'
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: 'السعر'
    },
    currency: {
        type: DataTypes.STRING(10),
        defaultValue: 'EGP',
        comment: 'العملة'
    },
    category: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'التصنيف (ملابس، أكل، خدمات تصميم، إلخ)'
    },
    images: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'JSON array: [{url, description, order}]',
        get() {
            const raw = this.getDataValue('images');
            if (!raw) return [];
            try {
                return JSON.parse(raw);
            } catch (e) {
                return [];
            }
        },
        set(val) {
            this.setDataValue('images', typeof val === 'string' ? val : JSON.stringify(val));
        }
    },
    status: {
        type: DataTypes.ENUM('available', 'out_of_stock'),
        defaultValue: 'available',
        comment: 'حالة المنتج: متاح أو نفد'
    },
    keywords: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'كلمات مفتاحية (AI Generated) للبحث والاستدعاء'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'تفعيل/تعطيل المنتج'
    }
}, {
    tableName: 'products'
});

// Relationships
User.hasMany(Product, { foreignKey: 'UserId', onDelete: 'CASCADE' });
Product.belongsTo(User, { foreignKey: 'UserId' });

export default Product;
